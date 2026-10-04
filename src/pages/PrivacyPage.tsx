import { Dash, Fill, LegalLayout, PrivacyContact, type LegalSection } from '../components/site/LegalLayout'
import { LEGAL } from '../lib/legal'

const sections: LegalSection[] = [
  {
    id: 'controlador',
    title: 'Quem controla os dados',
    body: (
      <>
        <p>
          A XS Prospecção é oferecida por <Fill value={LEGAL.controlador} what="nome ou razão social" fallback="seu responsável" />
          {LEGAL.documento || import.meta.env.DEV ? (
            <>
              , <Fill value={LEGAL.documento} what="CPF ou CNPJ" fallback="" />
            </>
          ) : null}
          {LEGAL.endereco || import.meta.env.DEV ? (
            <>
              , com endereço em <Fill value={LEGAL.endereco} what="endereço" fallback="" />
            </>
          ) : null}
          . Para os dados da sua conta, somos o <strong>controlador</strong>: decidimos como eles são usados para a XS funcionar.
        </p>
        {(LEGAL.encarregado || import.meta.env.DEV) && (
          <p>
            Encarregado pelo tratamento de dados: <Fill value={LEGAL.encarregado} what="nome do encarregado (opcional)" fallback="" />.
          </p>
        )}
        <p>
          Contato para assuntos de privacidade: <PrivacyContact />.
        </p>
      </>
    ),
  },
  {
    id: 'papeis',
    title: 'Seus dados e os dados dos seus leads',
    body: (
      <>
        <p>A XS lida com dois tipos de informação, e a responsabilidade é diferente em cada um:</p>
        <Dash
          items={[
            <>
              <strong>Dados da sua conta</strong> (nome, e-mail, perfil): somos o controlador.
            </>,
            <>
              <strong>Dados que você cadastra sobre empresas e pessoas</strong> (leads, contatos, clientes, projetos, conversas): você decide quem prospectar,
              o que anotar e o que fazer com essas informações. Nesse caso, você é o controlador e a XS atua como <strong>operador</strong>, guardando e
              processando os dados apenas para entregar as funções que você usa.
            </>,
          ]}
        />
        <p>
          Por isso, quem usa a XS para prospectar é responsável por ter uma base legal para entrar em contato, por atender os pedidos das pessoas que
          contata (por exemplo, de não receber mais ligações ou mensagens) e por apagar o que não precisa mais guardar.
        </p>
      </>
    ),
  },
  {
    id: 'dados',
    title: 'Quais dados podem ser tratados',
    body: (
      <>
        <p>Da sua conta:</p>
        <Dash items={['Nome e e-mail informados no cadastro.', 'Senha (guardada pelo serviço de autenticação em formato de hash, nunca visível para nós).', 'Cidade, preferências e informações do seu perfil.', 'Plano, data do teste grátis e recursos liberados.']} />
        <p>Do que você cadastra ou importa na XS:</p>
        <Dash
          items={[
            'Nome da empresa, nicho, endereço, cidade, telefone, WhatsApp, e-mail, site, Instagram e data de abertura.',
            'Nome e cargo de responsáveis ou pessoas com quem você falou.',
            'CNPJ e dados públicos da empresa, como razão social e quadro de sócios.',
            'Histórico de ligações e contatos, retornos, reuniões, observações e mensagens.',
            'Clientes, projetos, tarefas, valores, pagamentos, receitas e despesas.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'origem',
    title: 'Como os dados são obtidos',
    body: (
      <Dash
        items={[
          <>
            <strong>Por você</strong>: no cadastro, no perfil e em tudo o que você digita, cola ou importa por planilha.
          </>,
          <>
            <strong>Pela busca de empresas</strong>: o servidor de busca da XS consulta a base pública do CNPJ que a Receita Federal publica
            todo mês (dados abertos): nome, endereço, telefone, e-mail, atividade e quadro de sócios das empresas ativas. O CPF que aparece no
            nome de alguns microempreendedores é removido e nunca chega ao app. Para conferir o site e achar o Instagram, o servidor abre a
            página pública do site da empresa, quando ela tem um.
          </>,
          <>
            <strong>Pela consulta pública de CNPJ</strong>: quando há um CNPJ, os dados cadastrais públicos da empresa são consultados na BrasilAPI.
          </>,
          <>
            <strong>Pelo WhatsApp</strong>: se você usar o disparo automático e conectar o seu WhatsApp ao Motor WhatsApp XS (programa opcional), a confirmação de entrega, de leitura e as respostas às mensagens
            enviadas pela XS entram no histórico do lead.
          </>,
        ]}
      />
    ),
  },
  {
    id: 'finalidades',
    title: 'Para que usamos os dados',
    body: (
      <Dash
        items={[
          'Criar e manter a sua conta, fazer login e recuperar a senha.',
          'Entregar as funções da XS: lista de leads, Modo Ligação, retornos, reuniões, mensagens, clientes, projetos, financeiro e métricas.',
          'Controlar o teste grátis e o acesso aos recursos da sua conta.',
          'Enviar e-mails necessários ao serviço, como confirmação de cadastro e recuperação de senha.',
          'Manter o serviço seguro, investigar erros e evitar uso indevido.',
          'Cumprir obrigações legais e atender pedidos de autoridades quando exigido por lei.',
        ]}
      />
    ),
  },
  {
    id: 'bases-legais',
    title: 'Fundamentos legais',
    body: (
      <>
        <p>Usamos os dados da sua conta com base na Lei Geral de Proteção de Dados (Lei nº 13.709/2018), principalmente para:</p>
        <Dash
          items={[
            <>
              <strong>Executar o contrato</strong> que você aceita ao criar a conta (art. 7º, V).
            </>,
            <>
              <strong>Cumprir obrigações legais ou regulatórias</strong> (art. 7º, II).
            </>,
            <>
              <strong>Legítimo interesse</strong> em manter o serviço seguro e funcionando bem (art. 7º, IX), sempre respeitando seus direitos.
            </>,
            <>
              <strong>Consentimento</strong> (art. 7º, I), apenas quando ele for necessário, como ao permitir notificações do navegador.
            </>,
          ]}
        />
        <p>
          Para os dados dos seus leads e clientes, a base legal é definida por você, como controlador. Em prospecção entre empresas, costuma ser o
          legítimo interesse, levando em conta que dados tornados públicos devem ser usados de acordo com a finalidade e a boa-fé que justificaram a
          sua publicação (art. 7º, §§ 3º e 4º).
        </p>
      </>
    ),
  },
  {
    id: 'armazenamento',
    title: 'Onde os dados ficam',
    body: (
      <>
        <p>
          Os dados da conta e tudo o que você cadastra ficam num banco de dados do <strong>Supabase</strong>, na região de São Paulo. Cada registro é
          ligado ao seu usuário, e o banco aplica regras de acesso por linha: uma conta só consegue ler e alterar os próprios dados.
        </p>
        <p>
          Se você usar o <strong>Motor WhatsApp XS</strong> (programa opcional, só para o disparo automático no WhatsApp), ele guarda no seu computador a sessão do
          WhatsApp e as campanhas de envio. Essas informações não são enviadas para os nossos servidores.
        </p>
        <p>
          Algumas preferências ficam salvas no seu navegador (veja <a href="#navegador">Cookies e armazenamento no navegador</a>).
        </p>
      </>
    ),
  },
  {
    id: 'terceiros',
    title: 'Serviços de terceiros',
    body: (
      <>
        <p>Para funcionar, a XS usa estes serviços. Cada um tem a sua própria política de privacidade:</p>
        <Dash
          items={[
            <>
              <strong>Supabase</strong>: banco de dados, login e e-mails de autenticação.
            </>,
            <>
              <strong>Vercel</strong>: hospedagem do site.
            </>,
            <>
              <strong>Oracle Cloud</strong>: servidor da busca de empresas. Ele recebe a cidade, os nichos e os filtros da busca e, para pular quem
              você já tem, os telefones e CNPJs da sua lista, que são usados só durante a busca e não ficam guardados.
            </>,
            <>
              <strong>WhatsApp</strong>: no disparo automático, as mensagens enviadas pelo Motor WhatsApp XS saem da sua própria conta de WhatsApp, conectada por QR Code.
            </>,
            <>
              <strong>BrasilAPI</strong>: consulta de dados públicos de CNPJ.
            </>,
            <>
              <strong>OpenStreetMap (Nominatim) e OpenFreeMap</strong>: localizar a cidade ou o ponto da busca e desenhar o mapa.
            </>,
          ]}
        />
        <p>
          Alguns desses serviços podem processar dados fora do Brasil. Quando isso acontece, a transferência segue as hipóteses permitidas pela LGPD
          (art. 33), como a necessária para executar o contrato com você.
        </p>
      </>
    ),
  },
  {
    id: 'compartilhamento',
    title: 'Compartilhamento',
    body: (
      <>
        <p>
          <strong>Não vendemos nem alugamos dados</strong>, e não usamos os seus leads para nenhuma finalidade própria.
        </p>
        <p>
          Os dados só são compartilhados com os serviços listados acima, na medida necessária para a XS funcionar, ou com autoridades quando houver
          obrigação legal ou ordem judicial.
        </p>
      </>
    ),
  },
  {
    id: 'navegador',
    title: 'Cookies e armazenamento no navegador',
    body: (
      <>
        <p>
          A XS <strong>não usa cookies de publicidade nem ferramentas de análise ou rastreamento</strong>. Por isso não há banner de cookies.
        </p>
        <p>O seu navegador guarda apenas o que é necessário para o app funcionar:</p>
        <Dash
          items={[
            'A sessão de login, para você não precisar entrar toda vez.',
            'Preferências como tema claro ou escuro, menu recolhido, avisos e a última busca de empresas.',
            'Uma cópia dos arquivos do site, para abrir mais rápido e funcionar como app instalado.',
          ]}
        />
        <p>Você pode apagar tudo isso a qualquer momento limpando os dados do site nas configurações do navegador.</p>
      </>
    ),
  },
  {
    id: 'seguranca',
    title: 'Segurança',
    body: (
      <>
        <p>Algumas das medidas que usamos:</p>
        <Dash
          items={[
            'Conexão com o site e com o banco de dados por HTTPS.',
            'Login com e-mail e senha; a senha é guardada em formato de hash pelo serviço de autenticação.',
            'Separação de dados por usuário diretamente no banco de dados.',
            'O Motor WhatsApp XS só aceita conexões do próprio computador e só responde ao app da XS.',
          ]}
        />
        <p>
          Nenhum sistema é totalmente imune a falhas. Se acontecer um incidente de segurança que possa trazer risco ou dano relevante, avisaremos os
          titulares afetados e a Autoridade Nacional de Proteção de Dados (ANPD), como a lei exige.
        </p>
      </>
    ),
  },
  {
    id: 'retencao',
    title: 'Por quanto tempo guardamos',
    body: (
      <>
        <p>
          Os dados ficam guardados <strong>enquanto a sua conta existir</strong>. Quando o teste grátis termina, o acesso é pausado, mas os seus leads e a
          sua gestão continuam guardados.
        </p>
        <p>
          Você pode editar ou apagar leads, clientes e registros a qualquer momento dentro do app. Se a sua conta for excluída, os dados ligados a ela
          são apagados do banco de dados. Cópias de segurança mantidas pelos provedores de infraestrutura podem levar algum tempo para serem
          substituídas, e algumas informações podem ser mantidas quando a lei exigir.
        </p>
        <p>Os dados guardados no seu computador pelo Motor WhatsApp XS ficam sob o seu controle e podem ser apagados excluindo a pasta de dados do programa.</p>
      </>
    ),
  },
  {
    id: 'direitos',
    title: 'Seus direitos',
    body: (
      <>
        <p>Pela LGPD (art. 18), você pode pedir, a qualquer momento:</p>
        <Dash
          items={[
            'Confirmação de que tratamos seus dados e acesso a eles.',
            'Correção de dados incompletos, inexatos ou desatualizados.',
            'Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei.',
            'Portabilidade dos dados.',
            'Eliminação dos dados tratados com base no seu consentimento.',
            'Informação sobre com quem compartilhamos seus dados.',
            'Informação sobre a possibilidade de não dar consentimento e o que isso implica.',
            'Revogação do consentimento.',
          ]}
        />
        <p>Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
      </>
    ),
  },
  {
    id: 'pedidos',
    title: 'Como fazer um pedido',
    body: (
      <>
        <p>
          Muita coisa você mesmo resolve no app: corrigir seu perfil, editar ou apagar leads e exportar um backup completo em <strong>Ajustes → Backup</strong>.
        </p>
        <p>
          Para o resto, como excluir a conta ou pedir uma cópia dos seus dados, escreva para <PrivacyContact />. Podemos pedir uma confirmação de que o
          pedido vem mesmo do dono da conta.
        </p>
        <p>
          <strong>Se você é uma pessoa ou empresa que foi contatada por um usuário da XS</strong>, quem decidiu entrar em contato e guarda os seus dados é
          esse usuário. O ideal é fazer o pedido diretamente a ele. Se não conseguir, fale com a gente e ajudaremos a encaminhar.
        </p>
      </>
    ),
  },
  {
    id: 'consentimento',
    title: 'Consentimento e revogação',
    body: (
      <>
        <p>
          Hoje a XS não depende do seu consentimento para funcionar. Quando pedirmos alguma permissão opcional, como notificações do navegador, você
          pode desligá-la a qualquer momento, nos Ajustes do app ou nas configurações do navegador, sem perder o acesso ao resto do serviço.
        </p>
        <p>A XS não envia e-mails de marketing. Se isso mudar, a inscrição será opcional e separada do cadastro.</p>
      </>
    ),
  },
  {
    id: 'alteracoes',
    title: 'Alterações nesta política',
    body: (
      <p>
        Podemos atualizar esta política quando a XS mudar ou a lei exigir. A data no topo da página mostra a versão atual. Mudanças importantes serão
        avisadas no app ou por e-mail.
      </p>
    ),
  },
  {
    id: 'contato',
    title: 'Contato',
    body: (
      <p>
        Dúvidas sobre esta política ou sobre os seus dados: <PrivacyContact />.
      </p>
    ),
  },
]

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Política de Privacidade"
      intro={
        <>
          <p>
            Esta página explica, em linguagem simples, quais dados a XS Prospecção usa, por que usa, onde eles ficam e o que você pode fazer com eles.
          </p>
          <p className="border-l border-line-strong pl-4 text-fg-3">
            Em resumo: seus dados ficam num banco de dados em São Paulo, separados por conta; a busca de empresas usa a base pública do CNPJ; não vendemos
            dados e não usamos rastreamento de publicidade.
          </p>
        </>
      }
      sections={sections}
    />
  )
}

export default PrivacyPage
