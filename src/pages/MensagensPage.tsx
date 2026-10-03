import { MessagesEditor } from '../components/MessagesEditor'
import { PageHeader } from '../components/PageHeader'

export function MensagensPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Modelos de mensagem"
        subtitle="Modelos usados no botão Mensagem. Cada modelo pode ter várias variações: cada lead recebe uma, em rodízio, para os textos não saírem todos iguais."
      />
      <section className="panel p-4">
        <MessagesEditor />
      </section>
    </div>
  )
}
