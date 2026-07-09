# Robust ASCII-only PowerShell implementation of VP report generator (NO OVERTIME COLUMN)
$recordsFile = "C:\Users\JD\Documents\Pontual\Relatorios\Records_AllDepts_260501_to_260531_7679.xls"
$outputDir = "C:\Users\JD\Documents\Pontual\Relatorios"

function Parse-Hms ($str) {
    if ($str -match '(\d{1,2}):(\d{2})') { return [int]$matches[1] * 60 + [int]$matches[2] }
    return 0
}

function Fmt-Hms ($totalMin) {
    if ($totalMin -le 0) { return "-" }
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

$content = [System.IO.File]::ReadAllText($recordsFile, [System.Text.Encoding]::UTF8)
$cellRegex = '(?i)<td[^>]*>(.*?)<\/td>'
$matches = [regex]::Matches($content, $cellRegex)

$employees = @{}
$currentEmp = $null
$currentDate = $null

foreach ($m in $matches) {
    $val = $m.Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', ''
    $val = $val.Trim()
    if (-not $val) { continue }
    if ($val -match '^(\d+)\s*-\s*(.*)$') {
        $empMatch = [regex]::Match($val, '^(\d+)\s*-\s*(.*)$')
        $id = $empMatch.Groups[1].Value.Trim()
        $name = $empMatch.Groups[2].Value.Trim()
        if ($id -eq "8" -or $name.ToUpper().Contains("JULIO")) { $currentEmp = $null; continue }
        if (-not $employees.ContainsKey($id)) { $employees[$id] = @{ id = $id; name = $name; days = @{} } }
        $currentEmp = $employees[$id]
        $currentDate = $null
        continue
    }
    if ($val -match '^(\d{1,2})/(\d{1,2})/(\d{4})$') {
        $dateMatch = [regex]::Match($val, '^(\d{1,2})/(\d{1,2})/(\d{4})$')
        $currentDate = "$($dateMatch.Groups[3].Value)-$($dateMatch.Groups[1].Value.PadLeft(2, '0'))-$($dateMatch.Groups[2].Value.PadLeft(2, '0'))"
        if ($currentEmp -and -not $currentEmp.days.ContainsKey($currentDate)) { $currentEmp.days[$currentDate] = New-Object System.Collections.Generic.List[string] }
        continue
    }
    if ($val -match '^\d{1,2}:\d{2}$') {
        if ($currentEmp -and $currentDate) { $currentEmp.days[$currentDate].Add($val) }
    }
}

$css = "body { font-family: 'Segoe UI', sans-serif; font-size: 11px; margin: 0; padding: 20px; color: #1e293b; background: #f8fafc; } " +
       ".page { background: #fff; width: 210mm; min-height: 297mm; padding: 20px; margin: 0 auto 30px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border-radius: 8px; position: relative; box-sizing: border-box; page-break-after: always; } " +
       ".header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 20px; } " +
       ".header-info h1 { color: #1e3a8a; font-size: 24px; margin: 0; font-weight: 800; text-transform: uppercase; } " +
       ".emp-box { background: #f1f5f9; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; display: flex; gap: 40px; border-left: 4px solid #1e3a8a; } " +
       ".emp-box strong { color: #1e3a8a; text-transform: uppercase; font-size: 10px; display: block; } " +
       ".emp-box span { font-size: 14px; font-weight: 600; } " +
       "table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } " +
       "th { background: #1e3a8a; color: #fff; padding: 10px; font-size: 9px; border: 1px solid #1e3a8a; } " +
       "td { padding: 8px; border: 1px solid #e2e8f0; text-align: center; } " +
       ".total-row { background: #eff6ff; font-weight: 700; color: #1e3a8a; } " +
       ".sigs { display: flex; justify-content: space-between; margin-top: 50px; } " +
       ".sig { width: 220px; text-align: center; border-top: 1px solid #1e293b; padding-top: 8px; font-weight: 600; } " +
       "@media print { .no-print { display: none; } .page { box-shadow: none; margin: 0; width: 100%; } }"

$html = "<html><head><style>$css</style></head><body>"
$html += "<div class='no-print' style='text-align:center;padding:20px;'><button onclick='window.print()' style='padding:12px 24px;background:#1e3a8a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;'>Gerar PDF / Imprimir</button></div>"

$csv = "Date;Employee;ID;Entry;Exit;Duration`n"
$sortedIds = $employees.Keys | Sort-Object { [int]$_ }

$startDate = Get-Date "2026-05-01"
$endDate = Get-Date "2026-05-31"

foreach ($id in $sortedIds) {
    $emp = $employees[$id]
    $totalWorkMin = 0; $tableRows = ""
    $curr = $startDate
    while ($curr -le $endDate) {
        $key = $curr.ToString("yyyy-MM-dd")
        $punches = if ($emp.days.ContainsKey($key)) { $emp.days[$key] } else { @() }
        $isWk = ($curr.DayOfWeek -eq 'Saturday' -or $curr.DayOfWeek -eq 'Sunday')
        $entry = "-"; $exit = "-"; $duration = "-"
        if ($punches.Count -ge 2) {
            $sortedPunches = $punches | Sort-Object { Parse-Hms $_ }
            $entry = $sortedPunches[0]; $exit = $sortedPunches[-1]
            $dur = (Parse-Hms $exit) - (Parse-Hms $entry)
            if ($dur -gt 360) { $dur -= 60 }
            $totalWorkMin += $dur; $duration = Fmt-Hms $dur
        } elseif ($punches.Count -eq 1) { $entry = $punches[0] }
        $rowStyle = if ($isWk -and $entry -eq "-") { "style='background:#f1f5f9;color:#94a3b8;'" } else { "" }
        $tableRows += "<tr $rowStyle><td>$($curr.ToString('dd/MM/yyyy'))</td><td>$entry</td><td>$exit</td><td>$duration</td></tr>"
        $csv += "$($curr.ToString('dd/MM/yyyy'));$($emp.name);$id;$entry;$exit;$duration`n"
        $curr = $curr.AddDays(1)
    }

    $safeName = Html-Encode-Safe $emp.name
    $html += "<div class='page'>"
    $html += "<div class='header'><div class='header-info'><h1>Pontual | Villa Peixoto</h1><p>Relat&oacute;rio de Assiduidade Mensal</p></div></div>"
    $html += "<div class='emp-box'><div><strong>Colaborador</strong><span>$safeName</span></div><div><strong>ID</strong><span>$id</span></div><div><strong>Per&iacute;odo</strong><span>01/05/2026 a 31/05/2026</span></div></div>"
    $html += "<table><thead><tr><th>Data</th><th>Entrada</th><th>Sa&iacute;da</th><th>Dura&ccedil;&atilde;o</th></tr></thead><tbody>$tableRows</tbody>"
    $html += "<tfoot><tr class='total-row'><td colspan='3' style='text-align:right'>TOTAL DO PER&Iacute;ODO:</td><td>$(Fmt-Hms $totalWorkMin)</td></tr></tfoot></table>"
    $html += "<div class='sigs'><div class='sig'>Assinatura do Colaborador</div><div class='sig'>Assinatura do Respons&aacute;vel</div></div></div>"
    $csv += "TOTAL;$($emp.name);$id;-;-;$(Fmt-Hms $totalWorkMin)`n`n"
}

$html += "</body></html>"
[System.IO.File]::WriteAllText((Join-Path $outputDir "Relatorio_VP_Maio.html"), $html, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $outputDir "Relatorio_VP_Maio.csv"), $csv, [System.Text.Encoding]::UTF8)
Write-Host "Relatório VP de Maio gerado com sucesso (Sem Horas Extra)!"
