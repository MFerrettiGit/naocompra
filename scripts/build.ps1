# build.ps1 - Gera os dados do site "naocompra".
# Fontes:
#   - Xlsx OU VendasCsv  -> vendas por setor/cliente/produto (18 meses)
#   - Estoque (compras\dados\estoque.js) -> base dos produtos + curva ABC
#   - produtos_meta.json (lancamentos)   -> situacao de linha (EM LINHA / FORA / SUSPENSO)
#   - marcas.js (lancamentos)            -> nome do fornecedor por codigo de marca
#
# Uso (recomendado - a partir da query dedicada):
#   .\build.ps1 -Xlsx "C:\...\export.xlsx"
#
# Uso legado (vendas.csv compartilhado com lancamentos):
#   .\build.ps1
[CmdletBinding()]
param(
  [string]$Xlsx      = "",
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
function Norm([string]$s){
  ((StripAccents $s).ToUpper() -replace '[^A-Z0-9]','')
}
function Sha256Hex([string]$s){
  $sha=[System.Security.Cryptography.SHA256]::Create()
  $b=$sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($s.ToLower()))
  ($b | ForEach-Object { $_.ToString('x2') }) -join ''
}
function Fkey([string]$pw){ (Sha256Hex ("nc-arq:" + $pw.ToLower())).Substring(0,16) }

# Converte letra(s) de coluna Excel para índice 0-based: A=0, B=1, ..., Z=25, AA=26
function ColToIdx([string]$letters){
  $n = 0
  foreach($ch in $letters.ToCharArray()){
    $n = $n * 26 + ([int][char]::ToUpper($ch) - [int][char]'A' + 1)
  }
  return $n - 1
}

# Lê um .xlsx sem Excel/Python e retorna array de PSCustomObject com headers da linha 1.
function Read-XlsxData([string]$Path){
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $tmp = Join-Path $env:TEMP ("nc_xl_" + [guid]::NewGuid().ToString("N"))
  [System.IO.Compression.ZipFile]::ExtractToDirectory($Path, $tmp)

  # Shared strings
  $shared = @()
  $ssPath = Join-Path $tmp "xl\sharedStrings.xml"
  if(Test-Path $ssPath){
    [xml]$ss = Get-Content $ssPath -Encoding UTF8
    foreach($si in $ss.sst.si){
      $t=""
      if($si.t){ $t=$si.t.'#text'; if(-not $t){$t=$si.t} }
      elseif($si.r){ $t = ($si.r | ForEach-Object { $x=$_.t.'#text'; if(-not $x){$x=$_.t}; $x }) -join "" }
      $shared += ,$t
    }
  }

  # Primeira folha
  $sheetPath = Join-Path $tmp "xl\worksheets\sheet1.xml"
  if(-not (Test-Path $sheetPath)){
    $sheets = Get-ChildItem (Join-Path $tmp "xl\worksheets") -Filter *.xml | Sort-Object Name
    $sheetPath = $sheets[0].FullName
  }
  [xml]$doc = Get-Content $sheetPath -Encoding UTF8

  $headers = @()       # índice 0-based -> nome da coluna
  $rows = New-Object System.Collections.ArrayList
  $firstRow = $true

  foreach($row in $doc.worksheet.sheetData.row){
    $cells = @{}
    foreach($c in $row.c){
      $colLetters = ($c.r -replace '\d+','')
      $idx = ColToIdx $colLetters
      $v = $c.v
      if($c.t -eq "s" -and $v -ne $null){ $v = $shared[[int]$v] }
      elseif($v -ne $null){ $v = "$v" }
      $cells[$idx] = if($v -ne $null){ $v } else { "" }
    }
    if($firstRow){
      $headers = @()
      foreach($k in ($cells.Keys | Sort-Object)){ $headers += $cells[$k] }
      $firstRow = $false
    } else {
      $obj = [ordered]@{}
      for($i=0; $i -lt $headers.Count; $i++){
        $obj[$headers[$i]] = if($cells.ContainsKey($i)){ $cells[$i] } else { "" }
      }
      [void]$rows.Add([PSCustomObject]$obj)
    }
  }

  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  return $rows
}

$setoresExcluir = @('(sem setor)','EXCLUIDOS','NORDESTE','M. FERRETTI','CENTRO OESTE')

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
$base = @{}
foreach($p in $est){
  $cod = $p.produto
  $linha = if($metaCods.ContainsKey($cod)){ $metaCods[$cod].linha } else { "?" }
  if($linha -ne "EM LINHA"){ continue }
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
$ci = [System.Globalization.CultureInfo]::InvariantCulture
$vendas = $null

if($Xlsx -ne ""){
  Write-Host "Lendo vendas de xlsx: $Xlsx"
  $rawRows = Read-XlsxData $Xlsx
  # Normaliza nomes de colunas (DATA/data, PRODUTO/produto, etc.)
  $vendas = $rawRows | ForEach-Object {
    $r = $_
    [PSCustomObject]@{
      data        = ($r.DATA ?? $r.data)
      produto     = ($r.PRODUTO ?? $r.produto)
      descricao   = ($r.DESCRICAO ?? $r.descricao)
      marca       = ($r.MARCA ?? $r.marca)
      linha       = ($r.LINHA ?? $r.linha)
      cliente     = ($r.CLIENTE ?? $r.cliente)
      nomecliente = ($r.NOME_CLIENTE ?? $r.nomecliente)
      rede        = ($r.REDE ?? $r.rede ?? "")
      vendedor    = ($r.VENDEDOR ?? $r.vendedor)
      setor       = ($r.SETOR ?? $r.setor)
      qtd         = ($r.QTD ?? $r.qtd)
      valor       = ($r.VALOR ?? $r.valor)
    }
  }
} else {
  Write-Host "Lendo vendas de CSV (legado)..."
  $vendas = Import-Csv $VendasCsv -Delimiter ';'
}

$refDate = ($vendas.data | Sort-Object | Select-Object -Last 1)
Write-Host "Data de referencia: $refDate   Total linhas: $($vendas.Count)"

# Agrega por setor
$setores = @{}
foreach($row in $vendas){
  $cod = $row.produto
  if(-not $base.ContainsKey($cod)){ continue }
  $setor = $row.setor
  if([string]::IsNullOrWhiteSpace($setor)){ continue }
  if($setoresExcluir -contains $setor){ continue }
  $cli = $row.cliente
  $val = [double]::Parse($row.valor, $ci)
  $qt  = [double]::Parse($row.qtd, $ci)
  $dt  = $row.data
  if(-not $setores.ContainsKey($setor)){ $setores[$setor] = @{ prods=@{}; clientes=@{} } }
  $S = $setores[$setor]
  if(-not $S.prods.ContainsKey($cod)){ $S.prods[$cod] = @{ q=0.0; v=0.0; ult=''; cli=(New-Object 'System.Collections.Generic.HashSet[string]') } }
  $sp = $S.prods[$cod]; $sp.q += $qt; $sp.v += $val; if($dt -gt $sp.ult){ $sp.ult = $dt }; [void]$sp.cli.Add($cli)
  if(-not $S.clientes.ContainsKey($cli)){ $S.clientes[$cli] = @{ nome=$row.nomecliente; rede=($row.rede ?? ""); prods=@{} } }
  $C = $S.clientes[$cli]
  if(-not $C.prods.ContainsKey($cod)){ $C.prods[$cod] = @{ q=0.0; v=0.0; ult='' } }
  $cp = $C.prods[$cod]; $cp.q += $qt; $cp.v += $val; if($dt -gt $cp.ult){ $cp.ult = $dt }
}

# ---- base.js ----
$prodOut = [ordered]@{}
foreach($cod in ($base.Keys | Sort-Object)){
  $b = $base[$cod]
  $prodOut[$cod] = [ordered]@{ d=$b.desc; m=$b.marcaNome; mc=$b.marca; c=$b.curva }
}
$baseObj = [ordered]@{ ref=$refDate; atualizadoEm=(Get-Date -Format 'dd/MM/yyyy HH:mm'); total=$base.Count; curvaA=$curvaA.Count; produtos=$prodOut }
$baseJs = "window.BASE = " + ($baseObj | ConvertTo-Json -Depth 6 -Compress) + ";"
Set-Content -Path (Join-Path $Root "dados\base.js") -Value $baseJs -Encoding UTF8

# ---- Monta objetos por setor ----
$objs = @{}
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
    [void]$cliArr.Add([ordered]@{ c=$cli; n=$C.nome; r=$C.rede; p=$pr })
  }
  $aNaoVende = @($curvaA | Where-Object { -not $S.prods.ContainsKey($_) }).Count
  $vendeSetor = $S.prods.Count
  $objs[$slug] = [ordered]@{ setor=$setorNome; slug=$slug; ref=$refDate; clientes=$cliArr; setorProds=$spOut }
  [void]$manSet.Add([ordered]@{ nome=$setorNome; slug=$slug; clientes=$nCli; vende=$vendeSetor; naoVende=($base.Count-$vendeSetor); curvaAnaoVende=$aNaoVende })
  $incluidos++
}
Write-Host "Setores incluidos: $incluidos"

# ---- ACESSOS (mesmas senhas do site campanhas) ----
$senhasPath = "C:\Users\COMPRASD\.claude\skills\senhas\references\senhas.json"
$SEN = [IO.File]::ReadAllText($senhasPath, [Text.UTF8Encoding]::new($false)) | ConvertFrom-Json

$regionalMembros = @{
  'NORDESTE' = @('AMERICANA','FRANCA','RIOCLARO','SAOCARLOS','CIRCUITO','RIBEIRAOPRETO','SJBOAVISTA','SETORPIRACICABA')
  'SUL'      = @('ATIBAIA','INDAIATUBA','CAMPINASNORTE','JUNDIAI','CARAGUATATUBA','SOROCABA','SJDOSCAMPOS','ITAPETININGA')
}
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
  } else {
    $sl = SlugDoValor $a.valor
    if($sl){ $allowed.Add($sl); $label = "Setor " + $slugToNome[$sl] } else { $label = "Setor " + $a.valor }
  }
  $allowed = $allowed | Select-Object -Unique
  if(-not $allowed -or $allowed.Count -eq 0){ Write-Host "  (sem setor na base) senha=$($a.senha) escopo=$esc valor=$($a.valor)" }
  $fk = Fkey $a.senha
  $sb = New-Object System.Text.StringBuilder
  foreach($slug in $allowed){ [void]$sb.AppendLine( "(window.SETORES=window.SETORES||{})['$slug'] = " + ($objs[$slug] | ConvertTo-Json -Depth 8 -Compress) + ";" ) }
  Set-Content -Path (Join-Path $dirD "$fk.js") -Value $sb.ToString() -Encoding UTF8
  [void]$acessosOut.Add([ordered]@{ h=$a.hash; escopo=$esc; valor=([string]$a.valor); label=$label })
  $setoresStr = ($allowed | ForEach-Object { $slugToNome[$_] }) -join ', '
  $tab += "$($a.senha);$esc;$setoresStr`r`n"
}
Write-Host "Acessos: $($acessosOut.Count)"

$manObj=[ordered]@{ ref=$refDate; atualizadoEm=(Get-Date -Format 'dd/MM/yyyy HH:mm'); baseTotal=$base.Count; curvaA=$curvaA.Count; setores=$manSet; acessos=$acessosOut }
$manJs = "window.MANIFEST = " + ($manObj | ConvertTo-Json -Depth 6 -Compress) + ";"
Set-Content -Path (Join-Path $Root "dados\manifest.js") -Value $manJs -Encoding UTF8

Set-Content -Path (Join-Path $Root "scripts\SENHAS.csv") -Value $tab -Encoding UTF8
try { Copy-Item (Join-Path $Root "scripts\SENHAS.csv") "C:\Users\COMPRASD\Downloads\naocompra-SENHAS.csv" -Force -ErrorAction Stop }
catch { Copy-Item (Join-Path $Root "scripts\SENHAS.csv") ("C:\Users\COMPRASD\Downloads\naocompra-SENHAS-" + (Get-Date -Format 'HHmmss') + ".csv") -Force }

Write-Host "`nOK. base=$($base.Count) setores=$incluidos curvaA=$($curvaA.Count) acessos=$($acessosOut.Count) ref=$refDate"
Write-Host "Senhas: Downloads\naocompra-SENHAS.csv"
