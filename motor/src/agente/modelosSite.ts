// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Prompts de site que o dono já usou no Claude e deram certo: são o modelo (estrutura, rigor e tom)
 * que o Xico segue ao escrever o prompt de um cliente novo.
 */

export const EXEMPLOS_PROMPT_SITE: { titulo: string; texto: string }[] = [
  {
    titulo: 'Restaurante/bar com cardápio (Cantagalo Bar)',
    texto: `Quero que você desenvolva um site completo, moderno e profissional para o **Cantagalo Bar**, restaurante/bar tradicional de Mogi das Cruzes – SP, inaugurado em 2006.

O projeto NÃO deve ser apenas um cardápio digital. Quero um **site institucional + cardápio online completo**, capaz de apresentar a identidade, história, ambiente e produtos do Cantagalo e, ao mesmo tempo, funcionar muito bem para clientes que entram apenas para consultar o cardápio pelo celular.

Vou anexar imagens do cardápio atual, identidade visual, logo e referências do estabelecimento. **Analise profundamente essas imagens antes de desenvolver qualquer interface.** Utilize-as como fonte principal para compreender cores, tipografia, personalidade, categorias, pratos, bebidas, preços e linguagem visual.

### IDENTIDADE DO CANTAGALO

O Cantagalo tem uma identidade própria inspirada em **boteco brasileiro tradicional, boemia carioca e estética retrô**, e isso precisa ser preservado.

A referência visual do cardápio atual possui:

- amarelo forte;
- vermelho;
- preto/grafite;
- branco/off-white;
- marrom/couro;
- texturas de papel, couro e materiais envelhecidos;
- fotografias em molduras;
- recortes e colagens;
- elementos desenhados à mão;
- setas;
- tipografia pesada nos títulos;
- tipografia manuscrita usada pontualmente;
- referências à música brasileira;
- o galo como elemento marcante da marca.

Não copie literalmente o cardápio antigo. **Transforme essa identidade em uma experiência digital contemporânea.**

O resultado deve parecer um site criado especialmente para um bar tradicional com quase duas décadas de história, e não um template genérico de restaurante.

Evite completamente estética artificial de IA: excesso de gradientes, glassmorphism, cards flutuando por toda parte, textos exageradamente publicitários, blobs aleatórios, ícones genéricos, sombras excessivas, elementos decorativos sem função ou imagens falsas de comida.

---

### OBJETIVO PRINCIPAL

O site precisa cumprir três funções:

**1. Apresentar o Cantagalo**

Mostrar rapidamente para alguém que nunca visitou o estabelecimento:

- o que é o Cantagalo;
- sua história desde 2006;
- o conceito de boteco tradicional;
- comida de boteco;
- almoço;
- happy hour;
- chopp;
- música;
- ambiente social.

**2. Exibir todo o cardápio**

Todos os produtos presentes nas imagens anexadas devem ser transformados em conteúdo real do site.

Não invente produtos.
Não invente preços.
Não altere nomes.

Se alguma informação da imagem estiver ilegível, marque-a no código como conteúdo que precisa de confirmação, em vez de inventar.

**3. Direcionar pedidos**

O Cantagalo já utiliza:

https://pedido.anota.ai/loja/cantagalo-restaurante

Portanto, não crie um sistema de checkout falso.

O site deve possuir CTAs como:

**Pedir online**
**Fazer pedido**

direcionando para o Anotaí.

---

# ESTRUTURA DA HOME

## Header

Header elegante e relativamente compacto.

Incluir:

- logo Cantagalo;
- Início;
- O Cantagalo;
- Cardápio;
- Destaques;
- Localização;
- botão **Pedir online**.

No mobile, criar menu simplificado.

O botão de cardápio deve ser extremamente fácil de encontrar.

---

## Hero

Quero uma hero com personalidade.

Não faça a estrutura genérica:

título à esquerda + parágrafo + botão + foto retangular à direita.

Explore a linguagem visual do próprio Cantagalo.

Pode utilizar:

- composição editorial;
- fotografia real de comida ou ambiente;
- recortes;
- textura sutil;
- elementos gráficos derivados do cardápio;
- o galo;
- pequenos detalhes manuscritos.

O visual deve remeter a um **boteco tradicional brasileiro reinterpretado digitalmente**.

A informação mais importante precisa aparecer imediatamente.

Exemplo de direção de conteúdo:

**O galo canta no mesmo canto desde 2006.**

Cantagalo Bar — comida de boteco, chopp gelado e boas histórias em Mogi das Cruzes.

CTAs:

**Ver cardápio**
**Pedir online**

Use essa frase apenas caso combine com a composição; não fique preso ao exemplo.

---

## Destaques da casa

Criar uma seção editorial mostrando alguns produtos emblemáticos.

Priorizar produtos que aparecem fortemente na identidade do Cantagalo, como:

- coxinha;
- torresmo;
- chopp;
- feijoada;
- pratos;
- petiscos.

Não transformar tudo em cards idênticos.

Utilize fotos grandes, tipografia e composição editorial.

---

## Desde 2006

Criar uma seção curta sobre a história.

O Cantagalo fica em Mogi das Cruzes e possui identidade inspirada nos tradicionais botecos e na boemia carioca.

Trabalhar visualmente o conceito:

**“O galo canta no mesmo canto desde 2006.”**

Pode utilizar fotografias antigas, molduras, elementos relacionados à música brasileira ou materiais fornecidos.

Evite escrever uma história fictícia.

---

# CARDÁPIO DIGITAL

Esta é uma das partes mais importantes do projeto.

Não quero simplesmente imagens do cardápio atual dentro do site.

Os produtos precisam virar **dados reais da aplicação**.

Organize os itens em um arquivo estruturado, por exemplo:

menu.ts

contendo:

\`\`\`ts
{
  category,
  name,
  description,
  price,
  image,
  featured
}
\`\`\`

Dessa forma será fácil alterar os preços posteriormente.

---

## Navegação por categorias

Criar categorias como as encontradas no material fornecido, incluindo quando aplicável:

- Tira-gostos;
- Porções;
- Pratos;
- Frango;
- Peixe;
- Massas;
- Porco;
- Carne;
- Hambúrgueres;
- Caldos;
- Sobremesas;
- Bebidas;
- Sucos;
- Cervejas;
- Chopp;
- Long necks;
- Caipirinhas;
- Caipirinhas da casa;
- Coquetéis;
- Gin;
- Cachaças;
- Vodka;
- Whisky;
- Aperitivos;
- Taças;
- Sem álcool.

Confirme todas as categorias pelas imagens antes de finalizar.

---

## UX do cardápio

O cardápio precisa ser excelente principalmente no celular.

Quero:

- barra de categorias;
- categorias com scroll horizontal no mobile;
- categoria ativa conforme a rolagem;
- busca por produto;
- navegação rápida;
- preço muito fácil de visualizar;
- descrição secundária;
- indicação visual para itens em destaque;
- imagens apenas quando existirem imagens adequadas;
- carregamento rápido.

Não coloque uma foto genérica em cada produto.

Se não houver foto real daquele prato, prefira uma apresentação tipográfica bem feita.

---

# SEÇÃO DE ALMOÇO

Destacar que o estabelecimento também possui almoço.

O material atual utiliza bastante a mensagem relacionada a almoço à la carte.

Crie uma seção bonita, mas curta, direcionando para os pratos do cardápio.

---

# EXPERIÊNCIA / AMBIENTE

Criar uma seção apresentando o Cantagalo como lugar de encontro.

Trabalhar elementos como:

comida,
chopp,
música,
conversa,
história
e ambiente.

Evite slogans genéricos como:

“uma experiência inesquecível”

“momentos únicos”

“sabores que encantam”

Escreva como uma marca real.

---

# LOCALIZAÇÃO

Apresentar:

**Cantagalo Bar**

Rua Dr. Ricardo Vilela, 1443  
Parque Monte Líbano  
Mogi das Cruzes – SP

Incluir mapa e botão para abrir rota.

Telefone presente no material:

**(11) 4799-3022**

Instagram:

**@cantagalobaroficial**

Antes de publicar, deixar essas informações centralizadas em um único arquivo/configuração para serem facilmente corrigidas.

---

# FOOTER

Footer simples e consistente com a marca.

Incluir:

- logo;
- navegação;
- endereço;
- Instagram;
- telefone;
- link do pedido online;
- Política de Privacidade;
- informações básicas de LGPD;
- copyright.

---

# DIREÇÃO VISUAL

Quero que você tenha liberdade criativa, mas siga estes princípios:

**Retrô brasileiro + editorial + contemporâneo.**

Utilize bastante espaço negativo.

O background pode utilizar um branco levemente quente ou textura extremamente sutil inspirada no papel do cardápio.

Amarelo deve funcionar como cor de destaque.

Vermelho deve aparecer em detalhes.

Grafite/preto deve ser usado para contraste.

Marrom/couro pode aparecer em áreas específicas.

Não utilize textura pesada em todas as seções.

A referência antiga é propositalmente carregada; o site novo deve capturar a personalidade dela de forma mais refinada.

---

# ANIMAÇÕES

Usar animações sutis.

Exemplos:

- revelação suave de conteúdo;
- pequenas transições entre seções;
- hover em fotos;
- deslocamentos discretos em elementos editoriais;
- categoria ativa do cardápio;
- transição elegante entre áreas claras e escuras.

Não utilizar animação apenas para impressionar.

Nada deve prejudicar velocidade ou legibilidade.

---

# RESPONSIVIDADE

A experiência mobile é prioridade.

O cardápio provavelmente será acessado pelo celular, inclusive dentro do estabelecimento.

Testar cuidadosamente:

375px,
390px,
430px,
tablet,
notebook
e desktop.

Não permita textos cortados, overflow horizontal, imagens saindo do container ou elementos decorativos cobrindo conteúdo.

---

# TECNOLOGIA

Desenvolver utilizando:

- Vite;
- React;
- TypeScript;
- Tailwind CSS.

Crie componentes reutilizáveis e código organizado.

Não instale bibliotecas desnecessárias.

Separe conteúdo de apresentação.

Centralize as informações do restaurante e do cardápio para facilitar manutenção.

Remova arquivos, dependências e componentes não utilizados.

---

# IMPORTANTE

Antes de começar a implementação:

1. analise todas as imagens fornecidas;
2. identifique a linguagem visual do Cantagalo;
3. extraia os produtos, categorias, descrições e preços;
4. planeje a arquitetura da página;
5. só então desenvolva.

Não substitua a identidade existente por um template.

Não invente dados.

Não use imagens artificiais de comida se houver material real disponível.

Não encha a página de cards.

Não exagere em rounded corners.

Não transforme o Cantagalo em restaurante gourmet/minimalista.

A página precisa continuar parecendo **Cantagalo**, apenas muito mais atual, organizada e adequada para web.

O resultado final deve passar a impressão de que uma agência analisou a história, o cardápio e a identidade visual do estabelecimento e criou uma experiência digital especificamente para ele.
IMAGENS REAIS DO ESTABELECIMENTO
Também estou fornecendo fotografias reais do Cantagalo obtidas de sua presença pública no Google Maps, incluindo uma fotografia da fachada e uma fotografia com diversos pratos servidos no restaurante.
Use essas imagens como referências prioritárias da aparência real do estabelecimento e de seus produtos. A foto da fachada pode ser utilizada em seções como “O Cantagalo”, história, localização ou ambiente. A fotografia dos pratos pode ser usada na hero ou em uma seção editorial de comida/destaques, desde que a composição mantenha boa qualidade visual.
Se você possuir acesso à web ou navegador, pesquise também Cantagalo Bar, Rua Dr. Ricardo Vilela, 1443, Mogi das Cruzes – SP para compreender melhor fachada, ambiente e presença pública da marca. Não dependa dessa pesquisa para construir o site e não invente informações que não conseguir confirmar.
Dê preferência absoluta a fotografias reais do Cantagalo em vez de imagens genéricas ou imagens geradas por IA.
https://pedido.anota.ai/loja/cantagalo-restaurante
https://www.google.com/maps/place/Cantagalo+Bar/@-23.5198148,-46.1845339,17z/data=!4m15!1m8!3m7!1s0x94cdd83995748629:0x7d1813caf2671cf2!2sCantagalo+Bar!8m2!3d-23.5198148!4d-46.181959!10e9!16s%2Fg%2F1tdgqypx!3m5!1s0x94cdd83995748629:0x7d1813caf2671cf2!8m2!3d-23.5198148!4d-46.181959!16s%2Fg%2F1tdgqypx?entry=ttu&g_ep=EgoyMDI2MDkyMi4wIKXMDSoASAFQAw%3D%3D`,
  },
  {
    titulo: 'Academia com planos e valores (ALT HUB)',
    texto: `Quero que você crie do zero um site profissional, completo, moderno e totalmente responsivo para a academia ALT HUB.

IMPORTANTE:
Antes de começar a desenvolver, analise TODAS as imagens anexadas.

As imagens incluem:
- logo oficial da ALT HUB;
- fotografias reais de alunos;
- fotografias reais dos profissionais;
- fotografias do espaço;
- materiais publicados pela academia;
- prints com informações institucionais;
- fotografia de um novo espaço atualmente em reforma/construção;
- tabela oficial de valores de 2026.

Utilize essas informações como base para todo o projeto.

==================================================
OBJETIVO DO PROJETO
==================================================

Este será um SITE DE APRESENTAÇÃO da ALT HUB.

O objetivo é transmitir:

- profissionalismo;
- confiança;
- acompanhamento;
- personalização;
- saúde;
- qualidade;
- cuidado;
- performance;
- exclusividade.

O site precisa parecer feito exclusivamente para a ALT HUB.

NÃO quero aparência de template genérico de academia.

IMPORTANTE:

Este projeto é uma DEMONSTRAÇÃO.

Precisa existir em algum local visível, porém discreto e elegante, a indicação:

“Site para demonstração”

Pode ser:

- pequeno badge próximo ao header;
- pequena barra superior;
- informação discreta no footer.

Não prejudique o design.

==================================================
INFORMAÇÕES OFICIAIS
==================================================

Nome:

ALT HUB

Instagram:

@althubacademia

Telefone / WhatsApp:

(13) 99710-3846

Número para links do WhatsApp:

5513997103846

Endereço oficial:

Av. Dr. Pedro Lessa, 2415
Embaré
Santos - SP
CEP 11025-030

ATENÇÃO:

Alguns prints podem apresentar outro número de endereço.

IGNORE qualquer endereço diferente.

Utilize EXCLUSIVAMENTE:

Av. Dr. Pedro Lessa, 2415 - Embaré, Santos - SP, 11025-030

==================================================
IDENTIDADE VISUAL
==================================================

Utilize o logo oficial anexado.

A identidade visual deve seguir a própria marca ALT HUB.

Cores principais:

- Preto
- Branco
- Vermelho
- Cinzas neutros

O vermelho deve funcionar como destaque.

Não quero o site inteiro vermelho.

Estética desejada:

- premium;
- moderna;
- minimalista;
- esportiva;
- sofisticada;
- limpa;
- humana;
- institucional;
- contemporânea.

Quero bastante espaço em branco.

Utilize contrastes fortes entre preto, branco e pequenos detalhes vermelhos.

Tipografia moderna.

Pode utilizar algo semelhante a:

- Inter
- Manrope
- Geist
- Neue Montreal
- ou alternativa moderna equivalente.

==================================================
NÃO QUERO
==================================================

Evitar completamente:

- aparência de template pronto;
- aparência de site feito por IA;
- excesso de vermelho;
- neon;
- gradientes exagerados;
- textos gigantes ocupando praticamente a tela inteira;
- dezenas de cards iguais;
- emojis;
- ilustrações genéricas;
- imagens de banco quando existem fotos reais disponíveis;
- efeitos 3D desnecessários;
- parallax pesado;
- scroll horizontal;
- animações exageradas;
- frases motivacionais genéricas;
- números inventados;
- depoimentos falsos.

==================================================
POSICIONAMENTO DA ALT HUB
==================================================

A ALT HUB NÃO deve ser apresentada como uma academia convencional.

A comunicação oficial disponível apresenta:

“Academia personalizada com metodologia própria.”

Principais áreas:

- Envelhecimento Ativo
- Recuperação Funcional
- Performance
- Musculação Personalizada
- Aulas Coletivas
- ALT Nutri
- ALT Care
- ALT Sense

Um dos principais diferenciais da ALT HUB é o acompanhamento próximo.

A musculação personalizada funciona em grupos reduzidos de:

ATÉ 4 ALUNOS POR PROFESSOR.

Esse diferencial precisa aparecer de maneira clara.

A comunicação deve mostrar que cada pessoa possui:

- objetivos diferentes;
- necessidades diferentes;
- condições diferentes;
- momentos diferentes da vida.

E que o treinamento é construído considerando essas características.

==================================================
TOM DA COMUNICAÇÃO
==================================================

Não utilize frases genéricas como:

“Supere seus limites.”

“Seja sua melhor versão.”

“Transforme seu corpo.”

“Sem dor, sem ganho.”

Quero uma comunicação mais madura, confiável e profissional.

Podem ser utilizadas ideias como:

“Treinamento pensado para você.”

“Mais do que treinar. Ser acompanhado.”

“Movimento, cuidado e performance em todas as fases da vida.”

“Seu treino começa com entender você.”

“Constância transforma.”

“Comece. Continue. Evolua.”

Não precisa utilizar todas.

Escolha somente as que fizerem sentido.

==================================================
ESTRUTURA GERAL DO SITE
==================================================

A página precisa contar uma história.

Sugestão:

HEADER

↓

HERO

↓

DIFERENCIAL ALT HUB

↓

PARA QUEM É A ALT

↓

METODOLOGIA

↓

MUSCULAÇÃO PERSONALIZADA

↓

ALT SENSE

↓

PLANOS E VALORES

↓

AULAS COLETIVAS

↓

ALT NUTRI

↓

ALT CARE

↓

NOVA ALT HUB

↓

EXPERIÊNCIA / GALERIA

↓

CONTATO

↓

FOOTER

Não quero simplesmente uma sequência de cards genéricos.

Crie ritmo visual entre as seções.

==================================================
HEADER
==================================================

Criar um header premium e minimalista.

No início da página pode ser transparente.

Após scroll, tornar-se sólido.

Logo ALT HUB à esquerda.

Menu:

Início

A ALT Hub

Metodologia

Treinamentos

Planos

Nova ALT

Contato

CTA principal:

“Agendar aula”

No mobile:

Criar menu hambúrguer elegante.

==================================================
HERO
==================================================

Quero uma primeira dobra muito forte.

Utilize uma das melhores fotografias reais anexadas.

Preferencialmente uma fotografia mostrando profissional + aluno.

A foto onde o profissional acompanha uma senhora em um equipamento é uma boa opção.

A imagem deve ocupar uma parte importante da composição.

Utilize overlay discreto caso seja necessário.

Sugestão de conteúdo:

pequeno texto:

ALT HUB • SANTOS

Título:

“Treinamento personalizado para cada fase da sua vida.”

Descrição:

“Metodologia própria, acompanhamento próximo e treinamento focado em saúde, recuperação e performance.”

Botões:

[ Agendar uma aula ]

[ Conhecer a ALT Hub ]

O botão principal abre WhatsApp.

Não utilizar H1 gigantesco.

O hero deve ser forte principalmente pela fotografia e composição.

==================================================
SEÇÃO — DIFERENCIAL ALT HUB
==================================================

Logo depois da hero, explicar rapidamente o posicionamento.

Título possível:

“Treinar é diferente quando existe acompanhamento.”

Texto curto:

A ALT HUB trabalha com metodologia própria e acompanhamento próximo, respeitando as necessidades, objetivos e momento de cada aluno.

Criar três ou quatro diferenciais.

Exemplo:

ACOMPANHAMENTO

Treinos acompanhados de perto por profissionais.

METODOLOGIA

Planejamento baseado nas necessidades de cada aluno.

GRUPOS REDUZIDOS

Musculação personalizada com até 4 alunos por professor.

EVOLUÇÃO

O planejamento acompanha o progresso e as necessidades do aluno.

==================================================
SEÇÃO — PARA QUEM É A ALT HUB
==================================================

Criar uma seção visualmente forte.

Apresentar:

01

ENVELHECIMENTO ATIVO

Treinamento direcionado para força, mobilidade, autonomia e qualidade de vida.

02

RECUPERAÇÃO FUNCIONAL

Atividades orientadas para recuperar movimentos e retornar progressivamente às atividades.

03

PERFORMANCE

Treinamento direcionado à melhora da capacidade física, força, resistência e desempenho.

Utilizar linguagem responsável.

Não prometer cura.

Não fazer diagnóstico.

Não garantir resultados.

==================================================
SEÇÃO — METODOLOGIA
==================================================

Criar uma seção explicando a experiência ALT.

Título possível:

“Você não é apenas mais um aluno.”

Criar um fluxo simples:

01 — ENTENDER

Conhecer objetivos, rotina e necessidades.

02 — AVALIAR

Utilizar a avaliação inicial para compreender o perfil físico.

03 — PLANEJAR

Estruturar um treinamento adequado ao perfil.

04 — ACOMPANHAR

Profissional próximo durante a execução.

05 — EVOLUIR

Ajustar o planejamento conforme evolução e necessidades.

==================================================
ATENDIMENTO PERSONALIZADO
==================================================

Criar uma seção visual destacando o acompanhamento profissional.

Utilizar fotografia real.

Título:

“Presença profissional em cada movimento.”

Texto curto:

“O acompanhamento próximo faz parte da experiência ALT HUB.”

Pode complementar:

“Orientação, técnica e atenção durante o treinamento.”

==================================================
MUSCULAÇÃO PERSONALIZADA
==================================================

Essa é uma das áreas mais importantes do site.

Descrição oficial:

“Musculação personalizada, com acompanhamento próximo e individualizado, em grupos reduzidos de até 4 alunos por professor.”

Destacar visualmente:

ATÉ 4 ALUNOS POR PROFESSOR.

Criar uma comunicação mostrando que isso proporciona acompanhamento próximo durante o treinamento.

Não fazer afirmações não comprovadas.

==================================================
ALT SENSE
==================================================

Criar uma seção importante para:

ALT SENSE

Valor:

R$ 180,00

Descrição:

A avaliação ALT SENSE é obrigatória para todos os alunos.

Ela analisa o perfil físico e metabólico e serve como base para a prescrição do treinamento.

Ela ajuda a:

- identificar condições individuais;
- identificar necessidades;
- orientar a prescrição;
- tornar o treinamento mais personalizado;
- acompanhar a evolução física.

Criar comunicação profissional.

Exemplo:

“Antes de começar, entendemos você.”

ALT SENSE

Avaliação inicial

R$ 180

Texto:

“Uma etapa essencial para conhecer suas condições, necessidades e construir um treinamento mais adequado ao seu perfil.”

IMPORTANTE:

Não apresentar como diagnóstico médico.

Não inventar exames.

Não inventar equipamentos.

Não inventar profissionais envolvidos.

==================================================
PLANOS E VALORES
==================================================

Agora temos a tabela oficial de preços de 2026.

Criar uma seção moderna chamada:

“Planos e Serviços”

Ou:

“Escolha como você quer treinar.”

Subtítulo possível:

“Opções para diferentes objetivos, rotinas e momentos.”

Não utilizar a fotografia da tabela diretamente dentro do site.

Transforme as informações em uma interface bonita e responsiva.

==================================================
MUSCULAÇÃO PERSONALIZADA — VALORES
==================================================

PERSONAL VIP

Aula avulsa:

R$ 120,00

------------------------------------------

1X POR SEMANA

Mensal:

R$ 239,90

Semestral:

R$ 189,90

------------------------------------------

2X POR SEMANA

Mensal:

R$ 349,90

Semestral:

R$ 279,90

------------------------------------------

3X POR SEMANA

Mensal:

R$ 409,90

Semestral:

R$ 329,90

------------------------------------------

4X POR SEMANA

Mensal:

R$ 479,90

Semestral:

R$ 379,90

------------------------------------------

5X POR SEMANA

Mensal:

R$ 539,90

Semestral:

R$ 429,90

------------------------------------------

6X POR SEMANA

Mensal:

R$ 552,90

Semestral:

R$ 459,90

A tabela oficial identifica o plano semestral com aproximadamente:

20% de desconto.

Pode mostrar:

MENSAL

SEMESTRAL

como toggle ou tabs.

==================================================
ALT COMBO
==================================================

Adicionar também:

ALT COMBO

Por mais:

R$ 69,90

O aluno adiciona:

3 aulas coletivas por semana.

Apresentar como complemento do plano.

Não inventar outras regras.

==================================================
DESIGN DOS PLANOS
==================================================

Não quero uma enorme tabela tradicional estilo Excel.

No desktop:

Criar um comparador elegante.

Exemplo:

Frequência

Mensal

Semestral

Ou utilizar cards muito limpos.

Uma boa solução seria:

toggle:

[ MENSAL ]

[ SEMESTRAL ]

E abaixo mostrar:

1x semana

2x semana

3x semana

etc.

O valor selecionado pode ganhar destaque vermelho.

Pode destacar visualmente o plano de 3x por semana para melhorar hierarquia.

MAS:

NÃO escreva:

“mais vendido”

“mais escolhido”

“recomendado”

ou algo semelhante sem possuir essa informação.

No celular:

Transformar os valores em cards/listas.

NÃO gerar tabela horizontal que precise arrastar para os lados.

==================================================
AULAS COLETIVAS
==================================================

A ALT HUB trabalha com:

- Ginástica Localizada
- Funcional
- ALT Flow

Não inventar outras modalidades.

Valores:

------------------------------------------

1X POR SEMANA

Mensal:

R$ 119,90

Semestral:

R$ 99,90

------------------------------------------

2X POR SEMANA

Mensal:

R$ 155,90

Semestral:

R$ 129,90

------------------------------------------

3X POR SEMANA

Mensal:

R$ 179,90

Semestral:

R$ 149,90

------------------------------------------

4X POR SEMANA

Mensal:

R$ 199,90

Semestral:

R$ 169,90

------------------------------------------

5X POR SEMANA

Mensal:

R$ 222,90

Semestral:

R$ 189,90

Criar uma apresentação simples.

Não precisa ocupar uma seção gigantesca.

==================================================
ALT NUTRI
==================================================

Criar uma área chamada:

ALT NUTRI

Descrição oficial:

“Plano nutricional integrado com o treinamento.”

Valores:

MENSAL

R$ 379,90

QUADRIMESTRAL

R$ 339,90

Não inventar:

- quantidade de consultas;
- nome de nutricionista;
- acompanhamento;
- exames;
- serviços extras.

Somente utilizar informações fornecidas.

==================================================
ALT CARE
==================================================

Criar uma seção:

ALT CARE

Serviços informados:

- Liberação miofascial
- Drenagem linfática
- Massagem relaxante
- Tratamento de diástase
- Tratamento de lipedema

Planos:

------------------------------------------

1X MÊS

Frequência:

1x por mês

Valor unitário:

R$ 189,90

Valor total:

R$ 189,90

------------------------------------------

2X MÊS

Frequência:

2x por mês

Valor unitário:

R$ 174,90

Valor total oficial:

R$ 339,90

------------------------------------------

4X MÊS

Frequência:

1x por semana

Valor unitário:

R$ 149,90

Valor total:

R$ 599,60

------------------------------------------

INTENSIVO

Frequência:

8 sessões no mês

Valor unitário:

R$ 129,90

Valor total:

R$ 1.039,20

IMPORTANTE:

Utilize EXATAMENTE os valores fornecidos.

Não tente recalcular ou substituir o valor informado pela academia.

==================================================
ATENDIMENTO COM HORÁRIO MARCADO
==================================================

Adicionar esta informação:

“O atendimento é realizado exclusivamente com horário marcado, garantindo organização, qualidade e segurança no acompanhamento de cada aluno.”

Pode aparecer próxima aos planos ou antes da área de contato.

==================================================
FORMAS DE PAGAMENTO
==================================================

Formas aceitas:

- PIX
- Cartão
- Dinheiro

Adicionar também:

PLANOS FAMÍLIA

Integrantes possuem:

5% DE DESCONTO NO VALOR DO PLANO.

Não inventar regras adicionais.

==================================================
CTA DOS PLANOS
==================================================

Depois dos planos, criar uma área:

“Não sabe qual plano escolher?”

Texto:

“Fale com a equipe ALT HUB e conheça as opções disponíveis.”

Botão:

[ Falar com a ALT Hub ]

Mensagem automática:

“Olá! Conheci a ALT Hub pelo site e gostaria de saber mais sobre os planos e treinamentos.”

==================================================
NOVA ALT HUB
==================================================

ESSA SEÇÃO É MUITO IMPORTANTE.

Uma das fotografias anexadas mostra um espaço atualmente EM REFORMA / CONSTRUÇÃO.

Essa imagem representa uma nova ALT HUB sendo preparada.

Não utilizar essa fotografia como se fosse o espaço atual.

Não deixar a impressão de academia abandonada.

Criar uma seção exclusiva para a expansão.

Pequeno texto:

ALT HUB ESTÁ CRESCENDO

Título possível:

“Uma nova ALT está tomando forma.”

Texto:

“Estamos preparando um novo espaço para ampliar a experiência ALT HUB. Um ambiente pensado para continuar oferecendo acompanhamento, estrutura e cuidado em cada treino.”

Adicionar:

“Em breve.”

Na fotografia pode existir pequeno elemento:

NOVA ALT HUB

EM CONSTRUÇÃO

Quero uma composição editorial.

Pode utilizar:

- imagem grande;
- tipografia forte;
- pequeno detalhe vermelho;
- bastante espaço em branco.

==================================================
GALERIA / EXPERIÊNCIA ALT
==================================================

Criar uma galeria curta utilizando as imagens REAIS fornecidas.

Mostrar:

- profissionais;
- alunos;
- acompanhamento;
- estrutura;
- equipamentos;
- ambiente.

Não utilizar dezenas de fotos.

Escolher somente as melhores.

Criar um layout editorial.

Variar proporção e tamanho das fotos.

Não fazer um carrossel genérico simplesmente porque é mais fácil.

==================================================
FRASE DE MARCA
==================================================

Criar uma pequena seção visual.

Pode utilizar:

“CONSTÂNCIA TRANSFORMA.”

Essa frase aparece nos materiais da academia.

Ou:

“COMECE. CONTINUE. EVOLUA.”

Escolher apenas uma como destaque.

Não preencher todo o site com frases motivacionais.

==================================================
CONTATO
==================================================

Criar uma seção forte de conversão.

Título:

“Venha conhecer a ALT HUB.”

Informações:

ALT HUB

Av. Dr. Pedro Lessa, 2415

Embaré

Santos - SP

CEP 11025-030

WhatsApp:

(13) 99710-3846

Instagram:

@althubacademia

Botões:

[ Falar no WhatsApp ]

[ Como chegar ]

O botão “Como chegar” deve abrir Google Maps utilizando o endereço correto.

Se possível, adicionar mapa integrado sem prejudicar performance.

==================================================
WHATSAPP
==================================================

Adicionar botão flutuante discreto.

Não quero popup agressivo.

Mensagem automática:

“Olá! Conheci a ALT Hub pelo site e gostaria de saber mais sobre os treinamentos.”

==================================================
FOOTER
==================================================

Criar footer predominantemente preto.

Adicionar:

logo ALT HUB

endereço

WhatsApp

Instagram

links rápidos

Política de Privacidade

Termos de Uso

Texto:

© 2026 ALT HUB. Todos os direitos reservados.

Adicionar de forma discreta:

“Site para demonstração”

==================================================
LGPD
==================================================

O site precisa seguir boas práticas relacionadas à LGPD.

Criar:

- página Política de Privacidade;
- página Termos de Uso.

Caso exista formulário:

Adicionar consentimento apropriado.

Caso sejam utilizados cookies não essenciais:

Criar aviso de cookies.

Caso não existam cookies não essenciais:

Não criar popup de cookies apenas por aparência.

Não inventar:

- CNPJ;
- razão social;
- informações jurídicas;
- DPO;
- e-mail jurídico.

==================================================
IMAGENS
==================================================

Analise individualmente todos os arquivos anexados.

IMPORTANTE:

Os prints de:

- Instagram;
- WhatsApp;
- tabela;
- materiais institucionais;

servem principalmente como REFERÊNCIA DE INFORMAÇÕES.

Não coloque screenshots do Instagram ou WhatsApp dentro do site.

Utilize as fotografias reais como parte do design.

O logo fornecido deve ser utilizado como identidade oficial.

==================================================
TRATAMENTO DE IMAGENS
==================================================

Para todas as fotografias:

- ajustar crop;
- ajustar object-position;
- comprimir;
- converter para WebP/AVIF quando apropriado;
- preservar resolução;
- não distorcer;
- utilizar lazy-loading fora da hero;
- manter rostos bem enquadrados.

Caso alguma imagem possua qualidade inferior:

Melhorar tecnicamente o máximo possível sem gerar aparência artificial ou artefatos.

==================================================
ANIMAÇÕES
==================================================

Quero animações modernas e discretas.

Exemplos permitidos:

- fade;
- pequeno translate vertical;
- reveal de títulos;
- hover nas fotos;
- zoom extremamente leve;
- transições suaves;
- header mudando no scroll;
- microinterações nos botões;
- contorno ou underline animado.

Não utilizar:

- textos voando;
- animações diferentes em cada elemento;
- parallax pesado;
- horizontal scroll;
- elementos perseguindo mouse;
- 3D exagerado;
- efeitos que prejudiquem leitura.

Respeitar:

prefers-reduced-motion.

==================================================
MOBILE FIRST
==================================================

Mobile é prioridade.

Testar:

375px

390px

430px

Também:

768px

1024px

1280px

1440px

1920px

No celular:

- hero não deve ocupar altura absurda;
- H1 não deve ficar gigantesco;
- não cortar rostos;
- botões fáceis de tocar;
- menu funcionando;
- tabela convertida em cards;
- nenhuma área com scroll lateral;
- WhatsApp flutuante sem cobrir conteúdo;
- textos com boa leitura.

==================================================
SEO
==================================================

Fazer SEO local.

Title sugerido:

ALT Hub | Academia Personalizada em Santos

Description:

Academia personalizada em Santos com metodologia própria, acompanhamento profissional, envelhecimento ativo, recuperação funcional e performance.

Configurar:

- meta title;
- description;
- Open Graph;
- favicon;
- canonical;
- sitemap.xml;
- robots.txt;
- headings corretos;
- alt das imagens;
- Schema.org;
- dados estruturados de negócio local;
- endereço;
- telefone;
- redes sociais.

Não fazer keyword stuffing.

==================================================
ACESSIBILIDADE
==================================================

Implementar:

- HTML semântico;
- contraste adequado;
- navegação por teclado;
- focus-visible;
- labels;
- alt text;
- aria quando necessário;
- botões com área clicável suficiente;
- hierarquia correta de headings.

==================================================
PERFORMANCE
==================================================

O site precisa ser rápido.

Evitar bibliotecas enormes.

Buscar ótimo desempenho em:

- LCP
- CLS
- INP

Otimizar:

- imagens;
- fontes;
- JavaScript;
- carregamento inicial;
- animações;
- assets.

==================================================
IMPLEMENTAÇÃO
==================================================

Caso o projeto esteja vazio, utilizar preferencialmente:

Vite

React

TypeScript

Tailwind CSS

Pode utilizar biblioteca de animação somente se realmente necessário.

Não coloque toda a aplicação em App.tsx.

Separar componentes.

Exemplo:

src/

components/

Header

Hero

About

Methodology

PersonalTraining

AltSense

Plans

CollectiveClasses

AltNutri

AltCare

Expansion

Gallery

Contact

Footer

pages/

Home

Privacy

Terms

assets/

images/

logos/

data/

plans.ts

Pode colocar todos os valores em um arquivo separado para facilitar manutenção.

==================================================
REGRAS SOBRE INFORMAÇÕES
==================================================

É PERMITIDO utilizar:

- endereço;
- telefone;
- Instagram;
- modalidades;
- serviços;
- preços;
- planos;
- ALT Sense;
- ALT Nutri;
- ALT Care;
- ALT Combo;
- formas de pagamento;
- Plano Família;
- informações da nova unidade;

pois foram fornecidos para este projeto.

NÃO inventar:

- CNPJ;
- razão social;
- anos de mercado;
- quantidade de alunos;
- quantidade de funcionários;
- número de unidades;
- depoimentos;
- avaliações;
- estrelas Google;
- prêmios;
- certificações;
- profissionais;
- promoções;
- modalidades;
- preços;
- horários de funcionamento;
- resultados garantidos;
- percentual de resultados;
- antes e depois;
- aula gratuita;
- matrícula grátis;
- parcelamento;
- taxa de matrícula;
- benefícios que não foram informados.

==================================================
REGRA SOBRE OS PREÇOS
==================================================

Os valores fornecidos neste prompt são oficiais para o projeto.

Utilize EXATAMENTE esses valores.

Não arredonde.

Não altere.

Não recalcule.

Não invente novos descontos.

Se houver alguma inconsistência matemática na tabela original, mantenha o valor oficial informado.

==================================================
EXPERIÊNCIA VISUAL
==================================================

Não quero simplesmente:

Hero
Card
Card
Card
Card
Footer

Crie uma experiência com variação visual.

Exemplos:

- seções brancas;
- algumas áreas pretas;
- fotos grandes;
- texto editorial;
- pequenas linhas vermelhas;
- números grandes usados como elementos gráficos;
- títulos com boa hierarquia;
- grids assimétricos;
- bastante espaço negativo.

A identidade deve parecer elegante e personalizada.

==================================================
DETALHE IMPORTANTE
==================================================

A ALT HUB possui diferentes áreas dentro da mesma experiência:

TREINAMENTO

Musculação Personalizada

Aulas Coletivas

AVALIAÇÃO

ALT Sense

NUTRIÇÃO

ALT Nutri

CUIDADO

ALT Care

Não trate tudo simplesmente como “planos de academia”.

Mostre que são diferentes frentes da experiência ALT.

==================================================
RESULTADO ESPERADO
==================================================

O site deve transmitir:

ALT HUB
↓
entender o aluno
↓
avaliar
↓
planejar
↓
acompanhar
↓
treinar
↓
cuidar
↓
evoluir

Quero um site que pareça ter sido desenvolvido por uma agência profissional especificamente para essa marca.

Priorize:

design;
clareza;
fotografias reais;
responsividade;
conversão;
confiança;
velocidade.
==================================================
CHECKLIST FINAL
==================================================

Antes de considerar o projeto terminado:

Confira se o telefone está correto:
(13) 99710-3846

Confira se o WhatsApp utiliza:
5513997103846

Confira o endereço:
Av. Dr. Pedro Lessa, 2415 - Embaré, Santos - SP, 11025-030

Confira todos os valores.
Confira ALT Sense.
Confira ALT Nutri.
Confira ALT Care.
Confira ALT Combo.
Confira Plano Família.
Confira as formas de pagamento.
Confira se a imagem da obra aparece somente relacionada à NOVA ALT HUB.
Confira todas as imagens.
Confira responsividade.
Confira mobile.
Confira os links do WhatsApp.
Confira Google Maps.
Confira SEO.
Confira acessibilidade.
Confira Política de Privacidade e Termos.
Confira performance.
Remova qualquer informação inventada.
Verifique erros ortográficos.
Verifique se existe alguma seção repetitiva.
Remova qualquer elemento que deixe o site com aparência genérica ou de IA.
Garanta que “Site para demonstração” esteja visível de maneira discreta e elegante.
Só considere o projeto concluído depois de realizar essa revisão completa.`,
  },
]
