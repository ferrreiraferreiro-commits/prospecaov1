import { Dash, Fill, LegalLayout, PrivacyContact, type LegalSection } from '../components/site/LegalLayout'
import { LEGAL } from '../lib/legal'

const sections: LegalSection[] = [
  {
    id: 'servico',
    title: 'O que é a XS Prospecção',
    body: (
      <>
        <p>
          A XS Prospecção é uma ferramenta online para prospectar e acompanhar clientes, feita principalmente para quem vende sites e serviços digitais
          para empresas. Ele reúne busca de empresas (base pública do CNPJ), lista de leads, Modo Ligação com roteiro e objeções, retornos, reuniões, mensagens
          de WhatsApp, clientes, projetos, financeiro, precificação e métricas.
        </p>
        <p>
          A XS é oferecida por <Fill value={LEGAL.controlador} what="nome ou razão social" fallback="seu responsável" />
          {(LEGAL.documento || import.meta.env.DEV) && (
            <>
              , <Fill value={LEGAL.documento} what="CPF ou CNPJ" fallback="" />
            </>
          )}
          . Ao criar uma conta, você concorda com estes Termos e com a <a href="/privacidade">Política de Privacidade</a>.
        </p>
      </>
    ),
  },
  {
    id: 'conta',
    title: 'Sua conta',
    body: (
      <Dash
        items={[
          'Você precisa informar um nome e um e-mail válidos e criar uma senha.',
          'A conta é pessoal. Guarde a sua senha e não a compartilhe; o que for feito com ela é de sua responsabilidade.',
          'Se perceber qualquer uso que não reconhece, troque a senha e avise a gente.',
          'Você precisa ter capacidade legal para aceitar estes Termos.',
        ]}
      />
    ),
  },
  {
    id: 'teste',
    title: 'Teste grátis',
    body: (
      <>
        <p>
          Toda conta nova começa com <strong>1 dia de teste grátis com todos os recursos liberados</strong>, inclusive a busca de empresas e o disparo
          automático no WhatsApp. O teste não pede cartão de crédito e não vira cobrança automática.
        </p>
        <p>
          Quando o teste termina, o acesso é pausado. Os seus leads e a sua gestão continuam guardados, e você pode falar com a gente para continuar
          usando a XS.
        </p>
      </>
    ),
  },
  {
    id: 'responsabilidades',
    title: 'Suas responsabilidades',
    body: (
      <>
        <p>Você é responsável pelo que cadastra na XS e pela forma como entra em contato com as pessoas e empresas. Isso inclui:</p>
        <Dash
          items={[
            'Respeitar a Lei Geral de Proteção de Dados (LGPD) e as demais leis aplicáveis à sua atividade.',
            'Ter uma base legal para guardar e usar os dados dos seus leads e clientes.',
            'Atender quem pedir para não receber mais ligações ou mensagens, e apagar dados que não precisa mais guardar.',
            'Garantir que as informações que você importa foram obtidas de forma legítima.',
            'Fazer cópias de segurança do que for importante para você (o app permite exportar um backup a qualquer momento).',
          ]}
        />
      </>
    ),
  },
  {
    id: 'uso-adequado',
    title: 'Uso adequado',
    body: (
      <>
        <p>Não é permitido usar a XS para:</p>
        <Dash
          items={[
            'Enviar spam, mensagens enganosas, ofensivas ou em volume que viole as regras do WhatsApp.',
            'Assediar pessoas, insistir em contatos depois de uma recusa clara ou contatar quem pediu para não ser contatado.',
            'Praticar fraude, golpes ou qualquer atividade ilegal.',
            'Guardar dados sensíveis (como saúde, religião ou orientação sexual) sem necessidade e base legal.',
            'Tentar acessar dados de outras contas, burlar limites do sistema ou atrapalhar o funcionamento do serviço.',
            'Copiar, revender ou criar um produto concorrente a partir da XS.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'servicos-externos',
    title: 'Integrações e serviços externos',
    body: (
      <>
        <p>
          A XS depende de serviços de terceiros, como Supabase (banco de dados e login), Vercel (hospedagem), Oracle Cloud (servidor da busca de
          empresas), Receita Federal (base pública do CNPJ), BrasilAPI (consulta de CNPJ) e OpenStreetMap (mapas). A lista completa está na <a href="/privacidade#terceiros">Política de Privacidade</a>.
        </p>
        <p>
          Não temos controle sobre esses serviços. Mudanças, limites ou falhas neles podem afetar algumas funções da XS, e o uso deles também segue os
          termos de cada um.
        </p>
      </>
    ),
  },
  {
    id: 'motor',
    title: 'Motor XS',
    body: (
      <>
        <p>
          O disparo automático no WhatsApp (envios em massa, funis e mensagens agendadas) funciona pelo <strong>Motor XS</strong>, um programa opcional
          para Windows que você baixa dentro do app e roda no seu computador. Todo o resto, inclusive a busca de empresas, funciona direto no
          navegador, no computador ou no celular.
        </p>
        <Dash
          items={[
            'O Motor precisa ficar aberto enquanto os envios acontecem.',
            'Ele só aceita conexões do próprio computador e guarda os dados dele numa pasta local, sob o seu controle.',
            'Você é responsável pelo computador onde o Motor roda, inclusive pelo acesso de outras pessoas a ele.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'whatsapp-maps',
    title: 'WhatsApp e dados públicos',
    body: (
      <>
        <p>
          A XS não é afiliada, patrocinada nem aprovada pelo Google, pelo WhatsApp ou pela Meta, nem pela Receita Federal. Os nomes são usados apenas para indicar com quais
          serviços a XS funciona.
        </p>
        <p>
          <strong>WhatsApp</strong>: o Motor XS conecta a sua própria conta de WhatsApp por QR Code, da mesma forma que o WhatsApp Web, e as mensagens
          saem do seu número. Essa conexão não usa a API oficial do WhatsApp para empresas. O WhatsApp pode limitar ou bloquear números que enviam muitas
          mensagens ou recebem denúncias. A XS ajuda com intervalos entre envios e pausa automática, mas não garante que isso não aconteça. O uso e o
          conteúdo das mensagens são de sua responsabilidade.
        </p>
        <p>
          <strong>Base pública do CNPJ</strong>: a busca usa os dados abertos que a Receita Federal publica todo mês. Telefones e e-mails
          podem estar desatualizados ou ser do escritório de contabilidade da empresa, e a XS não garante que estejam corretos. Use essas
          informações de forma compatível com a LGPD, para contato entre empresas, e respeite quem pedir para não ser contatado.
        </p>
      </>
    ),
  },
  {
    id: 'disponibilidade',
    title: 'Disponibilidade',
    body: (
      <p>
        Trabalhamos para a XS ficar sempre no ar, mas ela pode passar por manutenções, atualizações ou falhas, inclusive de serviços de terceiros. Não
        garantimos funcionamento ininterrupto nem livre de erros. Funções podem ser alteradas, melhoradas ou removidas com o tempo.
      </p>
    ),
  },
  {
    id: 'propriedade',
    title: 'Propriedade intelectual',
    body: (
      <>
        <p>
          A XS, incluindo o código, o design, a marca e o Motor XS, pertence ao seu responsável. Estes Termos dão a você o direito de usar o serviço, não
          a propriedade dele.
        </p>
        <p>
          <strong>Os dados que você cadastra continuam sendo seus.</strong> Você pode exportá-los a qualquer momento pelo backup do app. Seus roteiros,
          modelos de mensagem e anotações também são seus.
        </p>
      </>
    ),
  },
  {
    id: 'privacidade',
    title: 'Privacidade',
    body: (
      <p>
        O uso dos dados é explicado na <a href="/privacidade">Política de Privacidade</a>. Para os dados dos seus leads e clientes, você é o controlador e
        a XS atua como operador, tratando esses dados apenas para entregar as funções que você usa.
      </p>
    ),
  },
  {
    id: 'cancelamento',
    title: 'Suspensão e cancelamento',
    body: (
      <>
        <p>Você pode parar de usar a XS quando quiser e pedir a exclusão da sua conta pelo contato no fim desta página.</p>
        <p>
          Podemos suspender ou encerrar uma conta que viole estes Termos ou a lei, ou que coloque em risco o serviço ou outras pessoas. Sempre que
          possível, avisaremos antes e daremos a chance de exportar os dados.
        </p>
      </>
    ),
  },
  {
    id: 'limitacoes',
    title: 'Limitações de responsabilidade',
    body: (
      <>
        <p>A XS é uma ferramenta de organização. Ela não garante vendas, contatos atendidos ou qualquer resultado comercial.</p>
        <p>
          Na medida permitida pela lei, não respondemos por danos indiretos, lucros cessantes, perda de oportunidades, bloqueios de número no WhatsApp ou
          perda de dados causada por falhas de terceiros ou pelo uso em desacordo com estes Termos. Nada nestes Termos limita direitos que a lei garante
          a você e que não podem ser afastados.
        </p>
      </>
    ),
  },
  {
    id: 'alteracoes',
    title: 'Alterações dos termos',
    body: (
      <p>
        Podemos atualizar estes Termos quando a XS mudar ou a lei exigir. A data no topo mostra a versão atual. Mudanças importantes serão avisadas no app
        ou por e-mail; continuar usando a XS depois do aviso significa concordar com a nova versão.
      </p>
    ),
  },
  {
    id: 'lei',
    title: 'Lei aplicável',
    body: (
      <p>
        Estes Termos seguem as leis brasileiras. Fica eleito o foro de <Fill value={LEGAL.foro} what="cidade/UF do foro" fallback="domicílio do usuário" />
        , sem prejuízo do direito do consumidor de propor ação no foro do seu domicílio.
      </p>
    ),
  },
  {
    id: 'contato',
    title: 'Contato',
    body: (
      <p>
        Dúvidas, pedidos ou avisos sobre estes Termos: <PrivacyContact />.
      </p>
    ),
  },
]

export function TermsPage() {
  return (
    <LegalLayout
      title="Termos de Uso"
      intro={<p>Estas são as regras para usar a XS Prospecção. Elas foram escritas para serem lidas, então tentamos ser diretos.</p>}
      sections={sections}
    />
  )
}

export default TermsPage
