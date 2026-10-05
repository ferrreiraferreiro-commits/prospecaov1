-- Link da comunidade da XS no WhatsApp (grupo/comunidade criado pelo dono).
-- Aparece no menu do app para todas as contas; o dono edita na tela Contas.
-- Só acrescenta uma coluna: apps antigos continuam funcionando.
alter table public.xs_config add column if not exists whatsapp_comunidade text;

alter table public.xs_config drop constraint if exists xs_config_comunidade_https;
alter table public.xs_config add constraint xs_config_comunidade_https check (whatsapp_comunidade is null or whatsapp_comunidade ~ '^https://');

grant update (whatsapp_comunidade) on public.xs_config to authenticated;
