param([int]$Port=8096, [string]$Root="C:\Users\COMPRASD\naocompra")
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root on http://localhost:$Port/"
$mime = @{ ".html"="text/html"; ".css"="text/css"; ".js"="application/javascript"; ".png"="image/png"; ".jpg"="image/jpeg"; ".svg"="image/svg+xml"; ".ico"="image/x-icon"; ".json"="application/json"; ".csv"="text/csv" }
while($listener.IsListening){
  try{
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if([string]::IsNullOrEmpty($rel)){ $rel = "index.html" }
    $path = Join-Path $Root $rel
    if(Test-Path $path -PathType Container){ $path = Join-Path $path "index.html" }
    if(Test-Path $path -PathType Leaf){
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      if($mime.ContainsKey($ext)){ $ctx.Response.ContentType = $mime[$ext] }
      $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [Text.Encoding]::UTF8.GetBytes("404")
      $ctx.Response.OutputStream.Write($msg,0,$msg.Length)
    }
    $ctx.Response.OutputStream.Close()
  } catch {}
}
