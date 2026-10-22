Add-Type -AssemblyName System.Drawing
$sourceRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $sourceRoot 'mediamtx-manager/dist/assets'
$sizes = @(16,24,32,48,64,128,256,512,1024)
$images = @{}

foreach ($size in $sizes) {
  $bitmap = New-Object Drawing.Bitmap $size,$size
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = 'AntiAlias'
  $graphics.PixelOffsetMode = 'HighQuality'
  $graphics.ScaleTransform(($size/128.0),($size/128.0))
  $background = New-Object Drawing.Drawing2D.GraphicsPath
  $background.AddArc(4,4,60,60,180,90)
  $background.AddArc(64,4,60,60,270,90)
  $background.AddArc(64,64,60,60,0,90)
  $background.AddArc(4,64,60,60,90,90)
  $background.CloseFigure()
  $navy = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#102849'))
  $blue = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#60A8FF'))
  $mint = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#79E0C3'))
  $outline = New-Object Drawing.Pen ([Drawing.ColorTranslator]::FromHtml('#315A88')),2
  $graphics.FillPath($navy,$background)
  $graphics.DrawPath($outline,$background)
  $letter = New-Object Drawing.Drawing2D.GraphicsPath
  $points = @(@(20,94),@(20,36),@(34,36),@(49,60),@(64,36),@(78,36),@(78,94),@(64,94),@(64,61),@(49,82),@(34,61),@(34,94))
  $letter.AddPolygon([Drawing.PointF[]]@($points | ForEach-Object { New-Object Drawing.PointF $_[0],$_[1] }))
  $graphics.FillPath($blue,$letter)
  $graphics.FillPolygon($mint,[Drawing.PointF[]]@((New-Object Drawing.PointF 86,64),(New-Object Drawing.PointF 109,79),(New-Object Drawing.PointF 86,94)))
  $signal = New-Object Drawing.Pen ([Drawing.ColorTranslator]::FromHtml('#79E0C3')),4
  $signal.StartCap='Round'; $signal.EndCap='Round'
  $graphics.DrawBezier($signal,88,38,98,39,106,47,107,57)
  $graphics.DrawBezier($signal,88,48,93,49,96,52,97,57)
  $signal.Dispose()
  $memory = New-Object IO.MemoryStream
  $bitmap.Save($memory,[Drawing.Imaging.ImageFormat]::Png)
  $images[$size] = $memory.ToArray()
  $memory.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
  $background.Dispose(); $letter.Dispose(); $navy.Dispose(); $blue.Dispose(); $mint.Dispose(); $outline.Dispose()
}

[IO.File]::WriteAllBytes((Join-Path $assetRoot 'app-logo.png'),$images[1024])
[IO.File]::WriteAllBytes((Join-Path $assetRoot 'app-icon.png'),$images[256])
$iconStream = New-Object IO.MemoryStream
$writer = New-Object IO.BinaryWriter $iconStream
$iconSizes = @($sizes | Where-Object { $_ -le 256 })
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$iconSizes.Count)
$offset = 6 + 16 * $iconSizes.Count
foreach ($size in $iconSizes) {
  $dimension = if ($size -eq 256) { 0 } else { $size }
  $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]32)
  $writer.Write([uint32]$images[$size].Length); $writer.Write([uint32]$offset)
  $offset += $images[$size].Length
}
foreach ($size in $iconSizes) { $writer.Write([byte[]]$images[$size]) }
$writer.Flush()
$iconBytes = $iconStream.ToArray()
[IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'app.ico'),$iconBytes)
[IO.File]::WriteAllBytes((Join-Path $assetRoot 'app.ico'),$iconBytes)
$writer.Dispose(); $iconStream.Dispose()

# ICNS contains the same PNG renderings; lengths use network byte order.
$icns = New-Object IO.MemoryStream
$icnsWriter = New-Object IO.BinaryWriter $icns
function Write-BigEndian([IO.BinaryWriter]$sink,[int]$number) {
  $bytes = [BitConverter]::GetBytes($number)
  [Array]::Reverse($bytes); $sink.Write($bytes)
}
$chunks = @(@('icp4',16),@('icp5',32),@('icp6',64),@('ic07',128),@('ic08',256),@('ic09',512),@('ic10',1024))
$length = 8
foreach ($chunk in $chunks) { $length += 8 + $images[$chunk[1]].Length }
$icnsWriter.Write([Text.Encoding]::ASCII.GetBytes('icns')); Write-BigEndian $icnsWriter $length
foreach ($chunk in $chunks) {
  $icnsWriter.Write([Text.Encoding]::ASCII.GetBytes($chunk[0]))
  Write-BigEndian $icnsWriter (8+$images[$chunk[1]].Length)
  $icnsWriter.Write([byte[]]$images[$chunk[1]])
}
$icnsWriter.Flush()
[IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'MediaMTXManager.icns'),$icns.ToArray())
$icnsWriter.Dispose(); $icns.Dispose()
Write-Output 'Matching SVG, PNG, Windows ICO and macOS ICNS logo assets prepared.'
