-- Vendedor começa vendo só os leads que o dono passar para ele (gestor vê todos).
-- O dono ainda pode marcar "Vê todos os leads" na tela Equipe.
alter table public.equipe_membros alter column ve_todos set default false;
update public.equipe_membros set ve_todos = false where papel = 'vendedor';
