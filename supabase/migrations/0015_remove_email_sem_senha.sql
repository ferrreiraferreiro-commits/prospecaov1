-- Aplicar DEPOIS que o site com o login novo (0014) estiver no ar:
-- tira a versão antiga, que entregava o e-mail de qualquer usuário sem pedir senha.
drop function if exists public.email_para_login(text);
