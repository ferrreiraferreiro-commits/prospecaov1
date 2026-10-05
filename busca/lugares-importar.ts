// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Importa os comércios do Brasil da base aberta da Overture Maps (dados de Meta, Microsoft,
 * Foursquare e outros, licença aberta) para um SQLite que o lugares.ts consulta em milissegundos.
 *
 *   node lugares-importar.ts             importa a versão mais nova
 *   node lugares-importar.ts --se-novo   só importa se saiu versão nova (o timer mensal usa este)
 *   node lugares-importar.ts --caixa=-51.25,-23.40,-51.05,-23.25   só uma área (teste)
 *
 * Precisa do pacote @duckdb/node-api (o instalar-lugares.sh instala). A DuckDB lê só os
 * pedaços dos arquivos da Overture que caem no Brasil, direto do S3 público, sem baixar o mundo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DADOS = process.env.XS_DADOS || '/var/lib/xs-busca'
const BUCKET = 'https://overturemaps-us-west-2.s3.amazonaws.com'
const INFO = path.join(DADOS, 'lugares.json')
const FINAL = path.join(DADOS, 'lugares.db')
const NOVO = path.join(DADOS, 'lugares.novo.db')

const args = process.argv.slice(2)
const seNovo = args.includes('--se-novo')
const caixaArg = args.find((a) => a.startsWith('--caixa='))?.slice(8)
// Brasil inteiro (o filtro de país separa os vizinhos)
const [xmin, ymin, xmax, ymax] = caixaArg ? caixaArg.split(',').map(Number) : [-74.1, -33.8, -34.7, 5.4]

const log = (...m: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...m)

/** Versão mais nova da Overture que já tem a base de lugares. */
async function ultimaVersao(): Promise<string> {
  const xml = await (await fetch(`${BUCKET}/?list-type=2&prefix=release/&delimiter=/`)).text()
  const versoes = [...xml.matchAll(/<Prefix>release\/([^<]+)\/<\/Prefix>/g)].map((m) => m[1]).sort()
  for (const v of versoes.reverse()) {
    const l = await (await fetch(`${BUCKET}/?list-type=2&max-keys=1&prefix=release/${v}/theme=places/type=place/`)).text()
    if (/<KeyCount>[1-9]/.test(l)) return v
  }
  throw new Error('Não achei nenhuma versão da Overture com lugares.')
}

const UF: Record<string, string> = {
  acre: 'AC',
  alagoas: 'AL',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  goias: 'GO',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  para: 'PA',
  paraiba: 'PB',
  parana: 'PR',
  pernambuco: 'PE',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
}
const ufCase = `CASE ${Object.entries(UF)
  .map(([n, s]) => `WHEN rg = '${n}' THEN '${s}'`)
  .join(' ')} WHEN length(rg) = 2 THEN upper(rg) ELSE NULL END`

/** Redes sociais, encurtadores, páginas de links e de agendamento não contam como site próprio. */
const SOCIAL = String.raw`(instagram\.com|facebook\.com|fb\.com|fb\.me|wa\.me|wa\.link|whatsapp\.com|linktr\.ee|ifood\.com|tiktok\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|linkedin\.com|goo\.gl|g\.page|maps\.app|bit\.ly|tinyurl\.com|cutt\.ly|google\.com|booksy\.com|cashbarber\.com|trinks\.com|beacons\.ai|linkme\.bio|instabio\.cc|bio\.link|linkbio|taplink|msha\.ke|lnk\.bio|solo\.to|negocio\.site|business\.site|anota\.ai|goomer|menudino|olaclick|aiqfome|doctoralia)`

async function main() {
  fs.mkdirSync(DADOS, { recursive: true })
  const versao = await ultimaVersao()
  const atual = fs.existsSync(INFO) ? (JSON.parse(fs.readFileSync(INFO, 'utf8')) as { versao?: string }).versao : null
  if (seNovo && atual === versao && fs.existsSync(FINAL)) return log(`Base já está na versão ${versao}.`)
  log(`Importando a versão ${versao} da Overture (${caixaArg ? 'área de teste' : 'Brasil'})…`)

  // Importação dinâmica: o pacote só existe na VPS (o app não precisa dele)
  const pacote = '@duckdb/node-api'
  const { DuckDBInstance } = (await import(pacote)) as {
    DuckDBInstance: {
      create(p: string): Promise<{
        connect(): Promise<{ run(sql: string): Promise<unknown> }>
      }>
    }
  }
  const db = await DuckDBInstance.create(':memory:')
  const c = await db.connect()
  const tmp = path.join(DADOS, 'duckdb-tmp')
  fs.mkdirSync(tmp, { recursive: true })
  await c.run(`SET memory_limit='900MB'; SET threads=2; SET preserve_insertion_order=false;
    SET temp_directory='${tmp}'; SET extension_directory='${path.join(DADOS, 'duckdb-ext')}';
    INSTALL httpfs; LOAD httpfs; INSTALL sqlite; LOAD sqlite; SET s3_region='us-west-2';`)

  const parquet = path.join(DADOS, 'lugares-br.parquet')
  const t0 = Date.now()
  // 1) Só o Brasil, só o que tem nome, com as colunas que a busca usa
  await c.run(`COPY (
      SELECT id, names."primary" AS nome, taxonomy."primary" AS tax, basic_category AS cat,
             phones, websites, socials, emails, addresses[1] AS a, confidence AS conf, operating_status AS st,
             (bbox.ymin + bbox.ymax) / 2 AS lat, (bbox.xmin + bbox.xmax) / 2 AS lng
      FROM read_parquet('s3://overturemaps-us-west-2/release/${versao}/theme=places/type=place/*.parquet')
      WHERE bbox.xmin BETWEEN ${xmin} AND ${xmax} AND bbox.ymin BETWEEN ${ymin} AND ${ymax}
        AND addresses[1].country = 'BR' AND names."primary" IS NOT NULL
        AND coalesce(operating_status, 'open') = 'open' AND confidence >= 0.2
    ) TO '${parquet}' (FORMAT parquet, COMPRESSION zstd)`)
  log(`Baixado em ${Math.round((Date.now() - t0) / 1000)} s.`)

  // 2) Tabela pronta para a busca, no SQLite
  fs.rmSync(NOVO, { force: true })
  await c.run(`ATTACH '${NOVO}' AS lite (TYPE sqlite)`)
  await c.run(`CREATE TABLE lite.lugares AS
    WITH b AS (
      SELECT *,
        list_filter(list_transform(coalesce(phones, []), p -> regexp_replace(p, '[^0-9]', '', 'g')), d -> length(d) BETWEEN 12 AND 13 AND d[1:2] = '55') AS tels,
        list_concat(coalesce(websites, []), coalesce(socials, [])) AS links,
        regexp_replace(strip_accents(lower(trim(coalesce(a.region, '')))), '\\s+', ' ', 'g') AS rg
      FROM read_parquet('${parquet}')
    )
    SELECT
      id,
      trim(nome) AS nome,
      trim(regexp_replace(strip_accents(lower(nome)), '[^a-z0-9]+', ' ', 'g')) AS nome_n,
      coalesce(tax, cat) AS tax,
      coalesce(list_filter(tels, d -> length(d) = 13 AND d[5] = '9')[1], tels[1]) AS tel,
      list_filter(tels, d -> d <> coalesce(list_filter(tels, d -> length(d) = 13 AND d[5] = '9')[1], tels[1]))[1] AS tel2,
      list_filter(coalesce(websites, []), w -> NOT regexp_matches(lower(w), '${SOCIAL}'))[1] AS site,
      list_filter(links, w -> lower(w) LIKE '%instagram.com/%')[1] AS insta,
      list_filter(links, w -> lower(w) LIKE '%facebook.com/%')[1] AS face,
      emails[1] AS email,
      a.freeform AS endereco,
      a.postcode AS cep,
      a.locality AS cidade,
      trim(regexp_replace(strip_accents(lower(coalesce(a.locality, ''))), '[^a-z0-9]+', ' ', 'g')) AS cidade_n,
      ${ufCase} AS uf,
      round(lat, 6) AS lat,
      round(lng, 6) AS lng,
      round(conf, 3) AS conf
    FROM b
    WHERE a.locality IS NOT NULL`)
  await c.run(`DETACH lite`)
  log(`Tabela montada em ${Math.round((Date.now() - t0) / 1000)} s.`)

  // 3) Índices e troca sem derrubar a busca (o servidor reabre o arquivo novo sozinho)
  const lite = new DatabaseSync(NOVO)
  lite.exec(`CREATE INDEX lugares_cidade ON lugares (uf, cidade_n, tax);
    DELETE FROM lugares WHERE uf IS NULL OR cidade_n = '';
    ANALYZE;`)
  const total = (lite.prepare('SELECT count(*) AS n FROM lugares').get() as { n: number }).n
  const comTel = (lite.prepare('SELECT count(*) AS n FROM lugares WHERE tel IS NOT NULL').get() as { n: number }).n
  lite.close()
  if (!caixaArg && total < 500_000) throw new Error(`Só ${total} lugares: algo deu errado, a base antiga fica.`)
  fs.renameSync(NOVO, FINAL)
  fs.rmSync(parquet, { force: true })
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.writeFileSync(INFO, JSON.stringify({ versao, total, comTel, em: new Date().toISOString() }))
  log(`Pronto: ${total.toLocaleString('pt-BR')} lugares (${comTel.toLocaleString('pt-BR')} com telefone), versão ${versao}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
