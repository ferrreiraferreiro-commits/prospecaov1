-- Status 1 personalizável: nomes, cores e quais aparecem em "Como foi a ligação?".
alter table public.settings add column if not exists status1 jsonb;
