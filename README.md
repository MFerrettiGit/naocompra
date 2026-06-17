# NÃO COMPRA — M. Ferretti

Relatório, por **setor de venda**, dos produtos da base que ainda **não são vendidos** —
tanto no setor como um todo quanto cliente a cliente. Cada vendedor entra com sua senha e
vê **apenas o seu setor**.

## Como pensa o relatório

**Base ideal de produtos** (o que o setor *deveria* vender): produtos do **relatório de estoque**
(vendidos nos últimos **65 dias** = os que de fato giram) cruzados com a situação de linha do
cadastro — ficam só os **EM LINHA** (fora de linha / suspensos são removidos). Resultado: **256 SKUs**,
cada um com sua **curva ABC** oficial (do estoque). *A princípio todo setor precisa vender a curva A.*

**Vendas** vêm do histórico por setor/cliente/produto (mesma fonte do site de lançamentos:
`vendas.csv`, ~18 meses). Para cada setor e cada cliente sabemos o que comprou, quanto e quando.

## Telas (após login)

- **Resumo** — cobertura da base, nº de produtos nunca vendidos, **curva A não vendida (vermelho =
  prioridade)** e as maiores oportunidades (A/B vendidas a poucos clientes do setor).
- **Por setor** — todos os 256 produtos com situação **Vende / Parou / Nunca vendeu** (a régua de
  recência é ajustável: 90/120/180/365 dias). Filtros por curva, marca, busca e status.
- **Por cliente** — escolha o cliente e veja o que ele **não compra**, com destaque para curva A e
  para **OPORTUNIDADE** (produto que o setor já vende a outros clientes, mas este não).

## Acesso / privacidade

- Login por **senha de setor** (admin vê todos via seletor). Senhas viram **hash SHA-256**;
  o texto puro fica só em `scripts/acessos.json` e `scripts/SENHAS.csv` (**não versionados**).
- Os dados de cada setor ficam em `dados/d/<chave>.js`, onde `<chave>` é derivada da **senha**
  (não consta no manifesto). Sem a senha do setor não há como nem **descobrir o nome do arquivo**,
  logo um vendedor não baixa os dados de outro setor.
- ⚠️ Ainda assim é um site estático: quem **tem a senha de um setor** consegue ler os dados
  daquele setor no fonte da página. É barreira para separar vendedores, não criptografia.

## Atualizar os dados

1. Atualize o `vendas.csv` (site de lançamentos) e o `estoque.js` (site de compras) — fontes vivas.
2. `powershell -ExecutionPolicy Bypass -File scripts\build.ps1`
   (regenera `base.js`, `manifest.js`, `dados/d/*.js` e a tabela de senhas).
3. `powershell -ExecutionPolicy Bypass -File scripts\publish.ps1`  (commit + push + Pages).

## Fontes

- `compras\dados\estoque.js` — estoque/curva ABC (janela de 65 dias).
- `lancamentos\dados_raw\produtos_meta.json` — situação de linha + marca.
- `lancamentos\dados\marcas.js` — nome do fornecedor por marca.
- `lancamentos\dados_raw\vendas.csv` — vendas por setor/cliente/produto.
