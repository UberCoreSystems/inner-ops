param(
  [string]$DocxPath = 'C:\Users\boliv\dev\inner-ops\QA_PLAN.docx'
)
$ErrorActionPreference = 'Stop'
$mdPath   = 'C:\Users\boliv\dev\inner-ops\QA_PLAN.md'
$htmlPath = 'C:\Users\boliv\dev\inner-ops\.QA_PLAN.tmp.html'
$docxPath = $DocxPath

function Escape-Html($s) {
  $s = $s -replace '&','&amp;'
  $s = $s -replace '<','&lt;'
  $s = $s -replace '>','&gt;'
  return $s
}

function Inline-Md($s) {
  # bold **text**
  $s = [regex]::Replace($s, '\*\*(.+?)\*\*', '<strong>$1</strong>')
  # italic *text* (avoid bold pattern remnants)
  $s = [regex]::Replace($s, '(?<![\*])\*(?!\s)([^*]+?)\*(?!\*)', '<em>$1</em>')
  # inline code `code`
  $s = [regex]::Replace($s, '`([^`]+)`', '<code>$1</code>')
  # links [text](url)
  $s = [regex]::Replace($s, '\[([^\]]+)\]\(([^)]+)\)', '<a href="$2">$1</a>')
  return $s
}

$styles = @'
<style>
body { font-family: Calibri, "Segoe UI", sans-serif; font-size: 11pt; color: #222; line-height: 1.45; }
h1 { font-size: 22pt; color: #0b3a66; margin: 0 0 10pt 0; }
h2 { font-size: 16pt; color: #0b3a66; border-bottom: 1pt solid #c0c0c0; padding-bottom: 2pt; margin: 18pt 0 8pt 0; }
h3 { font-size: 13pt; color: #1f4e79; margin: 14pt 0 4pt 0; }
h4 { font-size: 12pt; color: #1f4e79; margin: 10pt 0 4pt 0; }
p { margin: 4pt 0; }
ul, ol { margin: 4pt 0 4pt 18pt; padding: 0; }
li { margin: 2pt 0; }
.cb { margin: 2pt 0 2pt 12pt; }
hr { border: 0; border-top: 1pt solid #999; margin: 12pt 0; }
table { border-collapse: collapse; margin: 8pt 0; }
th, td { border: 1pt solid #999; padding: 4pt 8pt; text-align: left; }
th { background: #f0f0f0; }
code { font-family: Consolas, monospace; background: #f3f3f3; padding: 1pt 4pt; border-radius: 2pt; }
strong { color: #0b3a66; }
</style>
'@

$lines = Get-Content -LiteralPath $mdPath
$html = New-Object System.Collections.Generic.List[string]
$html.Add('<!DOCTYPE html>')
$html.Add('<html><head><meta charset="utf-8">')
$html.Add($styles)
$html.Add('</head><body>')

$inUL = $false
$inTable = $false
$tableHeaderDone = $false

function Close-List {
  param([ref]$flag, [System.Collections.Generic.List[string]]$out)
  if ($flag.Value) { $out.Add('</ul>'); $flag.Value = $false }
}
function Close-Table {
  param([ref]$flag, [ref]$hdrDone, [System.Collections.Generic.List[string]]$out)
  if ($flag.Value) { $out.Add('</table>'); $flag.Value = $false; $hdrDone.Value = $false }
}

foreach ($raw in $lines) {
  $line = $raw

  # blank line
  if ($line.Trim() -eq '') {
    Close-List ([ref]$inUL) $html
    Close-Table ([ref]$inTable) ([ref]$tableHeaderDone) $html
    continue
  }

  # horizontal rule
  if ($line -match '^---\s*$') {
    Close-List ([ref]$inUL) $html
    Close-Table ([ref]$inTable) ([ref]$tableHeaderDone) $html
    $html.Add('<hr/>')
    continue
  }

  # headings
  if ($line -match '^####\s+(.+)$') {
    Close-List ([ref]$inUL) $html
    Close-Table ([ref]$inTable) ([ref]$tableHeaderDone) $html
    $html.Add('<h4>' + (Inline-Md (Escape-Html $Matches[1])) + '</h4>')
    continue
  }
  if ($line -match '^###\s+(.+)$') {
    Close-List ([ref]$inUL) $html
    Close-Table ([ref]$inTable) ([ref]$tableHeaderDone) $html
    $html.Add('<h3>' + (Inline-Md (Escape-Html $Matches[1])) + '</h3>')
    continue
  }
  if ($line -match '^##\s+(.+)$') {
    Close-List ([ref]$inUL) $html
    Close-Table ([ref]$inTable) ([ref]$tableHeaderDone) $html
    $html.Add('<h2>' + (Inline-Md (Escape-Html $Matches[1])) + '</h2>')
    continue
  }
  if ($line -match '^#\s+(.+)$') {
    Close-List ([ref]$inUL) $html
    Close-Table ([ref]$inTable) ([ref]$tableHeaderDone) $html
    $html.Add('<h1>' + (Inline-Md (Escape-Html $Matches[1])) + '</h1>')
    continue
  }

  # tables (basic): | a | b | rows; skip the |---|---| separator
  if ($line -match '^\s*\|') {
    if ($line -match '^\s*\|\s*[-:]+\s*\|') { continue }
    Close-List ([ref]$inUL) $html
    if (-not $inTable) { $html.Add('<table>'); $inTable = $true; $tableHeaderDone = $false }
    $cells = ($line -replace '^\s*\|','' -replace '\|\s*$','') -split '\|'
    $tag = if ($tableHeaderDone) { 'td' } else { 'th' }
    $row = '<tr>' + (($cells | ForEach-Object { '<' + $tag + '>' + (Inline-Md (Escape-Html $_.Trim())) + '</' + $tag + '>' }) -join '') + '</tr>'
    $html.Add($row)
    if (-not $tableHeaderDone) { $tableHeaderDone = $true }
    continue
  } else {
    Close-Table ([ref]$inTable) ([ref]$tableHeaderDone) $html
  }

  # checkboxes
  if ($line -match '^\s*-\s*\[\s\]\s+(.+)$') {
    Close-List ([ref]$inUL) $html
    $html.Add('<p class="cb">&#9744; ' + (Inline-Md (Escape-Html $Matches[1])) + '</p>')
    continue
  }
  if ($line -match '^\s*-\s*\[x\]\s+(.+)$') {
    Close-List ([ref]$inUL) $html
    $html.Add('<p class="cb">&#9745; ' + (Inline-Md (Escape-Html $Matches[1])) + '</p>')
    continue
  }

  # bullet list
  if ($line -match '^\s*-\s+(.+)$') {
    if (-not $inUL) { $html.Add('<ul>'); $inUL = $true }
    $html.Add('<li>' + (Inline-Md (Escape-Html $Matches[1])) + '</li>')
    continue
  }

  # numbered list (render as paragraph with leading number to keep it simple)
  if ($line -match '^\s*(\d+)\.\s+(.+)$') {
    Close-List ([ref]$inUL) $html
    $html.Add('<p><strong>' + $Matches[1] + '.</strong> ' + (Inline-Md (Escape-Html $Matches[2])) + '</p>')
    continue
  }

  # default paragraph
  Close-List ([ref]$inUL) $html
  $html.Add('<p>' + (Inline-Md (Escape-Html $line)) + '</p>')
}

Close-List ([ref]$inUL) $html
Close-Table ([ref]$inTable) ([ref]$tableHeaderDone) $html
$html.Add('</body></html>')

$html -join "`r`n" | Out-File -LiteralPath $htmlPath -Encoding utf8 -Force

# Convert HTML to DOCX via Word COM
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Open($htmlPath, $false, $true) # ReadOnly=true
  $wdFormatDocumentDefault = 16
  $doc.SaveAs2($docxPath, $wdFormatDocumentDefault)
  $doc.Close($false)
} finally {
  $word.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}

Remove-Item -LiteralPath $htmlPath -Force -ErrorAction SilentlyContinue
Write-Output "OK: $docxPath"
