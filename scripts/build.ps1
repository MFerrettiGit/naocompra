# build.ps1 - Gera os dados do site "nãocompra" (produtos que cada setor/cliente NÃO vende).
# Fontes:
#   - Estoque (compras\dados\estoque.js) -> base "fiel" dos produtos vendidos em 65 dias + curva ABC
#   - produtos_meta.json (lancamentos)   -> situacao de linha (EM LINHA / FORA / SUSPENSO)
#   - marcas.js (lancamentos)            -> nome do fornecedor por codigo de marca
#   - vendas.csv (lancamentos)           -> vendas por setor / cliente / produto (18 meses)
# Regra da BASE IDEAL: produto do estoque (vendido em 65d) E classificado "EM LINHA".
[CmdletBinding()]
param(
  [string]$Root      = "C:\Users\COMPRASD\naocompra",
  [string]$EstoqueJs = "C:\Users\COMPRASD\compras\dados\estoque.js",
  [string]$MetaJson  = "C:\Users\COMPRASD\lancamentos\dados_raw\produtos_meta.json",
  [string]$MarcasJs  = "C:\Users\COMPRASD\lancamentos\dados\marcas.js",
  [string]$VendasCsv = "C:\Users\COMPRASD\lancamentos\dados_raw\vendas.csv",
  [int]$MinClientes  = 5
)
$ErrorActionPreference = "Stop"
function StripAccents([string]$s){
  $d = $s.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach($ch in $d.ToCharArray()){
    if([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark){ [void]$sb.Append($ch) }
  }
  $sb.ToString()
}
function Slug([string]$s){
  $t = (StripAccents $s).ToLower()
  $t = $t -replace '[^a-z0-9]+','-' -replace '(^-+|-+$)',''
  return $t
}
$setoresExcluir = @('(sem setor)','EXCLUIDOS','NORDESTE','M. FERRETTI')

Write-Host "Lendo estoque..."
$raw = Get-Content $EstoqueJs -Raw
$estJson = $raw -replace '(?s)^.*?window\.ESTOQUE\s*=\s*','' -replace ';\s*$',''
$est = $estJson | ConvertFrom-Json

Write-Host "Lendo meta de linha..."
$meta = Get-Content $MetaJson -Raw | ConvertFrom-Json
$metaCods = @{}; foreach($p in $meta.PSObject.Properties){ $metaCods[$p.Name] = $p.Value }

Write-Host "Lendo marcas..."
$mraw = Get-Content $MarcasJs -Raw
$marcaNome = @{}
foreach($mm in [regex]::Matches($mraw,'marca:\s*"([^"]+)"\s*,\s*fornecedor:\s*"([^"]+)"')){
  $marcaNome[$mm.Groups[1].Value] = $mm.Groups[2].Value
}

# ---- BASE IDEAL ----
$base = @{}   # cod -> {desc,marca,marcaNome,curva,giro,fat}
foreach($p in $est){
  $cod = $p.produto
  $linha = if($metaCods.ContainsKey($cod)){ $metaCods[$cod].linha } else { "?" }
  if($linha -ne "EM LINHA"){ continue }   # exclui fora de linha / suspenso
  $mc = if($metaCods.ContainsKey($cod)){ $metaCods[$cod].marca } else { "" }
  $base[$cod] = [ordered]@{
    desc      = ($p.descricao).Trim()
    marca     = $mc
    marcaNome = if($marcaNome.ContainsKey($mc)){ $marcaNome[$mc] } else { $mc }
    curva     = $p.abc
    giro      = $p.giro
  }
}
Write-Host "Base ideal (EM LINHA, 65d): $($base.Count) produtos"
$curvaA = @($base.Keys | Where-Object { $base[$_].curva -eq 'A' })
Write-Host "Curva A: $($curvaA.Count)"

# ---- VENDAS ----
Write-Host "Lendo vendas (pode levar alguns segundos)..."
$vendas = Import-Csv $VendasCsv -Delimiter ';'
$refDate = ($vendas.data | Sort-Object | Select-Object -Last 1)
Write-Host "Data de referencia: $refDate"

# Agrega por setor
$setores = @{}   # setor -> @{ prods=@{cod->@{q,v,ult,cli=hashset}}; clientes=@{cli->@{nome;prods=@{cod->@{q,v,ult}}}} }
$ci = [System.Globalization.CultureInfo]::InvariantCulture
foreach($row in $vendas){
  $cod = $row.produto
  if(-not $base.ContainsKey($cod)){ continue }   # so produtos da base ideal
  $setor = $row.setor
  if([string]::IsNullOrWhiteSpace($setor)){ continue }
  if($setoresExcluir -contains $setor){ continue }
  $cli = $row.cliente
  $val = [double]::Parse($row.valor, $ci)
  $qt  = [double]::Parse($row.qtd, $ci)
  $dt  = $row.data
  if(-not $setores.ContainsKey($setor)){ $setores[$setor] = @{ prods=@{}; clientes=@{} } }
  $S = $setores[$setor]
  # nivel setor x produto
  if(-not $S.prods.ContainsKey($cod)){ $S.prods[$cod] = @{ q=0.0; v=0.0; ult=''; cli=(New-Object 'System.Collections.Generic.HashSet[string]') } }
  $sp = $S.prods[$cod]; $sp.q += $qt; $sp.v += $val; if($dt -gt $sp.ult){ $sp.ult = $dt }; [void]$sp.cli.Add($cli)
  # nivel cliente x produto
  if(-not $S.clientes.ContainsKey($cli)){ $S.clientes[$cli] = @{ nome=$row.nomecliente; prods=@{} } }
  $C = $S.clientes[$cli]
  if(-not $C.prods.ContainsKey($cod)){ $C.prods[$cod] = @{ q=0.0; v=0.0; ult='' } }
  $cp = $C.prods[$cod]; $cp.q += $qt; $cp.v += $val; if($dt -gt $cp.ult){ $cp.ult = $dt }
}

# ---- EMITE base.js ----
$prodOut = [ordered]@{}
foreach($cod in ($base.Keys | Sort-Object)){
  $b = $base[$cod]
  $prodOut[$cod] = [ordered]@{ d=$b.desc; m=$b.marcaNome; mc=$b.marca; c=$b.curva }
}
$baseObj = [ordered]@{ ref=$refDate; atualizadoEm=(Get-Date -Format 'dd/MM/yyyy HH:mm'); total=$base.Count; curvaA=$curvaA.Count; produtos=$prodOut }
$baseJs = "window.BASE = " + ($baseObj | ConvertTo-Json -Depth 6 -Compress) + ";"
Set-Content -Path (Join-Path $Root "dados\base.js") -Value $baseJs -Encoding UTF8

function Sha256Hex([string]$s){
  $sha=[System.Security.Cryptography.SHA256]::Create()
  $b=$sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($s.ToLower()))
  ($b | ForEach-Object { $_.ToString('x2') }) -join ''
}
# fkey = nome do arquivo de dados, derivado da SENHA (nao publicado em lugar nenhum).
# So quem tem a senha do setor consegue calcular o nome do arquivo e baixar os dados.
function Fkey([string]$pw){ (Sha256Hex ("nc-arq:" + $pw.ToLower())).Substring(0,16) }

# ---- Monta objetos por setor (em memoria) + manSet ----
$objs = @{}   # slug -> objeto json do setor
$manSet = New-Object System.Collections.ArrayList
$incluidos = 0
foreach($setorNome in ($setores.Keys | Sort-Object)){
  $S = $setores[$setorNome]
  $nCli = $S.clientes.Count
  if($nCli -lt $MinClientes){ Write-Host "  (pulado, $nCli clientes) $setorNome"; continue }
  $slug = Slug $setorNome
  $spOut = [ordered]@{}
  foreach($cod in $S.prods.Keys){ $p=$S.prods[$cod]; $spOut[$cod]=@([math]::Round($p.v,2),$p.ult,$p.cli.Count) }
  $cliArr = New-Object System.Collections.ArrayList
  foreach($cli in ($S.clientes.Keys | Sort-Object)){
    $C=$S.clientes[$cli]; $pr=[ordered]@{}
    foreach($cod in $C.prods.Keys){ $cp=$C.prods[$cod]; $pr[$cod]=@([math]::Round($cp.v,2),$cp.ult) }
    [void]$cliArr.Add([ordered]@{ c=$cli; n=$C.nome; p=$pr })
  }
  $aNaoVende = @($curvaA | Where-Object { -not $S.prods.ContainsKey($_) }).Count
  $vendeSetor = $S.prods.Count
  $objs[$slug] = [ordered]@{ setor=$setorNome; slug=$slug; ref=$refDate; clientes=$cliArr; setorProds=$spOut }
  [void]$manSet.Add([ordered]@{ nome=$setorNome; slug=$slug; clientes=$nCli; vende=$vendeSetor; naoVende=($base.Count-$vendeSetor); curvaAnaoVende=$aNaoVende })
  $incluidos++
}
Write-Host "Setores incluidos: $incluidos"

# ---- ACESSOS: usa as MESMAS senhas do site de campanhas (skill senhas) ----
# Fonte da verdade = references\senhas.json (escopos todos / regional / setor).
$senhasPath = "C:\Users\COMPRASD\.claude\skills\senhas\references\senhas.json"
$SEN = [IO.File]::ReadAllText($senhasPath, [Text.UTF8Encoding]::new($false)) | ConvertFrom-Json

function Norm([string]$s){
  ((StripAccents $s).ToUpper() -replace '[^A-Z0-9]','')
}
# setor -> regional (extraido do roster das campanhas; valores conforme campanhas)
$regionalMembros = @{
  'NORDESTE' = @('AMERICANA','FRANCA','RIOCLARO','SAOCARLOS','CIRCUITO','RIBEIRAOPRETO','SJBOAVISTA','SETORPIRACICABA')
  'SUL'      = @('ATIBAIA','INDAIATUBA','CAMPINASNORTE','JUNDIAI','CARAGUATATUBA','SOROCABA','SJDOSCAMPOS','ITAPETININGA')
}
# indice normalizado -> slug (dos setores que existem na base)
$normToSlug = @{}; foreach($m in $manSet){ $normToSlug[(Norm $m.nome)] = $m.slug }
$slugToNome = @{}; foreach($m in $manSet){ $slugToNome[$m.slug] = $m.nome }
function SlugDoValor([string]$valor){
  $vn = Norm $valor
  if($normToSlug.ContainsKey($vn)){ return $normToSlug[$vn] }
  foreach($k in $normToSlug.Keys){ if($k.Contains($vn) -or $vn.Contains($k)){ return $normToSlug[$k] } }
  return $null
}

$dirD = Join-Path $Root "dados\d"
New-Item -ItemType Directory -Force -Path $dirD | Out-Null
Get-ChildItem $dirD -Filter *.js -ErrorAction SilentlyContinue | Remove-Item -Force

$acessosOut = New-Object System.Collections.ArrayList
$tab = "SENHA;ESCOPO;SETORES_LIBERADOS`r`n"
foreach($a in $SEN.acessos){
  $esc = $a.escopo
  $allowed = New-Object System.Collections.Generic.List[string]
  if($esc -eq 'todos'){
    foreach($m in $manSet){ $allowed.Add($m.slug) }
    $label = "Todos - " + $a.nome
  } elseif($esc -eq 'regional'){
    $membros = $regionalMembros[$a.valor]
    if($membros){ foreach($mn in $membros){ if($normToSlug.ContainsKey($mn)){ $allowed.Add($normToSlug[$mn]) } } }
    $label = "Regional " + $a.valor
  } else { # setor
    $sl = SlugDoValor $a.valor
    if($sl){ $allowed.Add($sl); $label = "Setor " + $slugToNome[$sl] } else { $label = "Setor " + $a.valor }
  }
  $allowed = $allowed | Select-Object -Unique
  if(-not $allowed -or $allowed.Count -eq 0){ Write-Host "  (sem setor na base) senha=$($a.senha) escopo=$esc valor=$($a.valor)" }
  # escreve arquivo de dados nomeado pela fkey da senha (so quem tem a senha calcula)
  $fk = Fkey $a.senha
  $sb = New-Object System.Text.StringBuilder
  foreach($slug in $allowed){ [void]$sb.AppendLine( "(window.SETORES=window.SETORES||{})['$slug'] = " + ($objs[$slug] | ConvertTo-Json -Depth 8 -Compress) + ";" ) }
  Set-Content -Path (Join-Path $dirD "$fk.js") -Value $sb.ToString() -Encoding UTF8
  # usa o hash oficial do senhas.json (mesma comparacao do site campanhas)
  [void]$acessosOut.Add([ordered]@{ h=$a.hash; escopo=$esc; valor=([string]$a.valor); label=$label })
  $setoresStr = ($allowed | ForEach-Object { $slugToNome[$_] }) -join ', '
  $tab += "$($a.senha);$esc;$setoresStr`r`n"
}
Write-Host "Acessos (senhas do campanhas): $($acessosOut.Count)"

# manifest (NAO contem fkey: o nome do arquivo so se obtem com a senha)
$manObj=[ordered]@{ ref=$refDate; atualizadoEm=(Get-Date -Format 'dd/MM/yyyy HH:mm'); baseTotal=$base.Count; curvaA=$curvaA.Count; setores=$manSet; acessos=$acessosOut }
$manJs = "window.MANIFEST = " + ($manObj | ConvertTo-Json -Depth 6 -Compress) + ";"
Set-Content -Path (Join-Path $Root "dados\manifest.js") -Value $manJs -Encoding UTF8

# tabela de senhas legivel (NAO publicada)
Set-Content -Path (Join-Path $Root "scripts\SENHAS.csv") -Value $tab -Encoding UTF8
try { Copy-Item (Join-Path $Root "scripts\SENHAS.csv") "C:\Users\COMPRASD\Downloads\naocompra-SENHAS.csv" -Force -ErrorAction Stop }
catch { Copy-Item (Join-Path $Root "scripts\SENHAS.csv") ("C:\Users\COMPRASD\Downloads\naocompra-SENHAS-" + (Get-Date -Format 'HHmmss') + ".csv") -Force }

Write-Host "`nOK. base=$($base.Count) setores=$incluidos curvaA=$($curvaA.Count) acessos=$($acessosOut.Count) ref=$refDate"
Write-Host "Senhas (referencia): Downloads\naocompra-SENHAS.csv"
