import type { DatabaseSync } from 'node:sqlite'

/** Estrutura do banco de busca (o importador cria; os testes usam para montar bancos pequenos). */
export const SCHEMA = `
CREATE TABLE meta (chave TEXT PRIMARY KEY, valor TEXT);
CREATE TABLE municipio (cod INTEGER PRIMARY KEY, nome TEXT, nome_n TEXT);
CREATE TABLE cnae (cod TEXT PRIMARY KEY, descricao TEXT, desc_n TEXT);
CREATE TABLE qualificacao (cod TEXT PRIMARY KEY, descricao TEXT);
CREATE TABLE est (
  cnpj TEXT PRIMARY KEY, basico TEXT, fantasia TEXT, cnae TEXT, cnaes2 TEXT,
  uf TEXT, mun INTEGER, bairro TEXT, bairro_n TEXT, endereco TEXT, cep TEXT,
  tel TEXT, cel INTEGER, tel2 TEXT, email TEXT, email_tipo INTEGER, inicio TEXT, matriz INTEGER
) WITHOUT ROWID;
CREATE TABLE empresa (basico TEXT PRIMARY KEY, razao TEXT, natureza TEXT, porte TEXT) WITHOUT ROWID;
CREATE TABLE socio (basico TEXT, nome TEXT, qualif TEXT);
`

/**
 * Domínio de e-mail usado por várias empresas diferentes não é site de nenhuma delas:
 * é provedor (ex.: provedor de internet da cidade), escritório de contabilidade ou rede.
 * Esses e-mails deixam de contar como "domínio próprio" (tipo 3 = e-mail de terceiros).
 */
export function markSharedDomains(db: DatabaseSync, minCompanies = 5): number {
  db.exec(`
    DROP TABLE IF EXISTS dominio_compartilhado;
    CREATE TABLE dominio_compartilhado AS
      SELECT substr(email, instr(email, '@') + 1) AS dominio, COUNT(DISTINCT basico) AS empresas
      FROM est WHERE email_tipo = 2 GROUP BY dominio HAVING empresas >= ${Math.max(2, Math.floor(minCompanies))};
    CREATE INDEX dominio_compartilhado_d ON dominio_compartilhado(dominio);
  `)
  const r = db.prepare(`UPDATE est SET email_tipo = 3 WHERE email_tipo = 2 AND substr(email, instr(email, '@') + 1) IN (SELECT dominio FROM dominio_compartilhado)`).run()
  return Number(r.changes)
}
