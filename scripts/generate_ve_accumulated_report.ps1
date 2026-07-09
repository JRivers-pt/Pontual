# Premium VE Accumulated Overtime Report Generator
$outputDir = "C:\Users\JD\Documents\Pontual\Relatorios"
$files = Get-ChildItem -Path $outputDir -Filter "Records_AllDepts_*.xls"

$employees = @{}

function Get-Total-Minutes ($str) {
    if ($str -match '(\d{1,2}):(\d{2})') {
        $m = [regex]::Match($str, '(\d{1,2}):(\d{2})')
        return [int]$m.Groups[1].Value * 60 + [int]$m.Groups[2].Value
    }
    return 0
}

function Fmt-Hms ($totalMin) {
    if ($totalMin -le 0) { return "0h00m" }
    $h = [Math]::Floor($totalMin / 60)
    $m = $totalMin % 60
    return "$($h)h$($m.ToString('00'))m"
}

function Html-Encode-Safe ($str) {
    if (-not $str) { return "" }
    $out = $str
    $out = $out -replace [char]225, "&aacute;" -replace [char]224, "&agrave;" -replace [char]227, "&atilde;" -replace [char]226, "&acirc;"
    $out = $out -replace [char]233, "&eacute;" -replace [char]234, "&ecirc;" -replace [char]237, "&iacute;"
    $out = $out -replace [char]243, "&oacute;" -replace [char]244, "&ocirc;" -replace [char]245, "&otilde;"
    $out = $out -replace [char]250, "&uacute;" -replace [char]231, "&ccedil;"
    $out = $out -replace [char]193, "&Aacute;" -replace [char]192, "&Agrave;" -replace [char]195, "&Atilde;" -replace [char]194, "&Acirc;"
    $out = $out -replace [char]201, "&Eacute;" -replace [char]202, "&Ecirc;" -replace [char]205, "&Iacute;"
    $out = $out -replace [char]211, "&Oacute;" -replace [char]212, "&Ocirc;" -replace [char]213, "&Otilde;"
    $out = $out -replace [char]218, "&Uacute;" -replace [char]199, "&Ccedil;"
    return $out
}

foreach ($file in $files) {
    Write-Host "Processando $($file.Name)..."
    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    $cellRegex = '(?i)<td[^>]*>(.*?)<\/td>'
    $matches = [regex]::Matches($content, $cellRegex)

    $currentEmp = $null
    $currentDate = $null

    foreach ($m in $matches) {
        $val = $m.Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', ''
        $val = $val.Trim()
        if (-not $val) { continue }
        
        # ID-Name detection
        if ($val -match '^(\d+)\s*-\s*(.*)$') {
            $empMatch = [regex]::Match($val, '^(\d+)\s*-\s*(.*)$')
            $id = $empMatch.Groups[1].Value.Trim()
            $name = $empMatch.Groups[2].Value.Trim()
            if (-not $employees.ContainsKey($id)) { $employees[$id] = @{ id = $id; name = $name; days = @{} } }
            $currentEmp = $employees[$id]
            $currentDate = $null
            continue
        }
        
        # Date detection
        if ($val -match '^(\d{1,2})/(\d{1,2})/(\d{4})$') {
            $dateMatch = [regex]::Match($val, '^(\d{1,2})/(\d{1,2})/(\d{4})$')
            $currentDate = "$($dateMatch.Groups[3].Value)-$($dateMatch.Groups[2].Value.PadLeft(2, '0'))-$($dateMatch.Groups[1].Value.PadLeft(2, '0'))"
            if ($currentEmp -and -not $currentEmp.days.ContainsKey($currentDate)) { $currentEmp.days[$currentDate] = New-Object System.Collections.Generic.List[string] }
            continue
        }
        
        # Time detection
        if ($val -match '^\d{1,2}:\d{2}$') {
            if ($currentEmp -and $currentDate) { $currentEmp.days[$currentDate].Add($val) }
        }
    }
}

$summaryData = @()
$sortedIds = $employees.Keys | Sort-Object { [int]$_ }

foreach ($id in $sortedIds) {
    $emp = $employees[$id]
    $monthlyOt = @{ "01" = 0; "02" = 0; "03" = 0; "04" = 0; "05" = 0 }
    $totalOt = 0
    
    foreach ($dateKey in $emp.days.Keys) {
        $punches = $emp.days[$dateKey]
        if ($punches.Count -ge 2) {
            $sorted = $punches | Sort-Object { Get-Total-Minutes $_ }
            $entry = $sorted[0]; $exit = $sorted[-1]
            $dur = (Get-Total-Minutes $exit) - (Get-Total-Minutes $entry)
            if ($dur -gt 360) { $dur -= 60 } # Lunch
            
            # VE Rule: OT starts at 6th minute
            if ($dur -ge 486) {
                $extra = $dur - 485
                $month = $dateKey.Substring(5, 2)
                if ($monthlyOt.ContainsKey($month)) {
                    $monthlyOt[$month] += $extra
                    $totalOt += $extra
                }
            }
        }
    }
    
    $summaryData += [PSCustomObject]@{
        ID = $id
        Name = $emp.name
        Jan = $monthlyOt["01"]
        Feb = $monthlyOt["02"]
        Mar = $monthlyOt["03"]
        Apr = $monthlyOt["04"]
        May = $monthlyOt["05"]
        Total = $totalOt
    }
}

$css = "body { font-family: 'Segoe UI', sans-serif; font-size: 12px; margin: 0; padding: 40px; color: #1e293b; background: #f8fafc; } " +
       ".report-container { background: #fff; max-width: 1000px; margin: 0 auto; padding: 30px; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1); border-radius: 12px; } " +
       ".header { border-bottom: 3px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; } " +
       ".header h1 { color: #1e3a8a; margin: 0; font-size: 28px; font-weight: 800; } " +
       "table { width: 100%; border-collapse: collapse; margin-top: 10px; } " +
       "th { background: #1e3a8a; color: #fff; padding: 12px; text-align: center; font-size: 11px; text-transform: uppercase; border: 1px solid #1e3a8a; } " +
       "td { padding: 10px; border: 1px solid #e2e8f0; text-align: center; } " +
       "tr:nth-child(even) { background: #f1f5f9; } " +
       ".total-col { font-weight: 800; color: #1e3a8a; background: #eff6ff !important; } " +
       ".footer { margin-top: 40px; font-size: 10px; color: #64748b; text-align: center; }"

$html = "<html><head><style>$css</style></head><body><div class='report-container'>"
$html += "<div class='header'><div><h1>Relat&oacute;rio Acumulado VE</h1><p style='margin:5px 0 0;'>Assiduidade e Horas Extra | Jan - Mai 2026</p></div>" +
         "<div style='text-align:right;'><p><strong>Empresa:</strong> VE Vontade e Empenho</p><p><strong>Data de Emiss&atilde;o:</strong> $(Get-Date -Format 'dd/MM/yyyy')</p></div></div>"
$html += "<table><thead><tr><th>ID</th><th style='text-align:left'>Colaborador</th><th>Jan</th><th>Fev</th><th>Mar</th><th>Abr</th><th>Mai</th><th class='total-col'>Total Acumulado</th></tr></thead><tbody>"

foreach ($row in $summaryData) {
    $safeName = Html-Encode-Safe $row.Name
    $html += "<tr><td>$($row.ID)</td><td style='text-align:left'>$safeName</td>" +
             "<td>$(Fmt-Hms $row.Jan)</td><td>$(Fmt-Hms $row.Feb)</td><td>$(Fmt-Hms $row.Mar)</td><td>$(Fmt-Hms $row.Apr)</td><td>$(Fmt-Hms $row.May)</td>" +
             "<td class='total-col'>$(Fmt-Hms $row.Total)</td></tr>"
}

$html += "</tbody></table><div class='footer'>Gerado automaticamente por Pontual Assiduidade &copy; 2026</div></div>"
$html += "<div style='text-align:center;margin-top:20px;' class='no-print'><button onclick='window.print()' style='padding:12px 24px;background:#1e3a8a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;'>Imprimir / Exportar PDF</button></div>"
$html += "</body></html>"

[System.IO.File]::WriteAllText((Join-Path $outputDir "Relatorio_Acumulado_VE_2026.html"), $html, [System.Text.Encoding]::UTF8)
Write-Host "Relatório Acumulado VE gerado com sucesso em $($outputDir)\Relatorio_Acumulado_VE_2026.html"
