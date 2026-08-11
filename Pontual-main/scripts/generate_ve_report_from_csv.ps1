# Premium VE Report Generator from CSV (With Smart Punch Detection)
$csvFile = "C:\Users\JD\Documents\Pontual\Relatorios\Records_AllDepts.csv"
$outputDir = "C:\Users\JD\Documents\Pontual\Relatorios"

$startDate = Get-Date "2026-03-31"
$endDate = Get-Date "2026-04-30"

function Get-Total-Minutes ($str) {
    if ($str -match '(\d{1,2}):(\d{2})') {
        $m = [regex]::Match($str, '(\d{1,2}):(\d{2})')
        return [int]$m.Groups[1].Value * 60 + [int]$m.Groups[2].Value
    }
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

$lines = Get-Content $csvFile -Encoding UTF8
$employees = @{}
$currentEmp = $null
$lastDate = $null

foreach ($line in $lines) {
    if (-not $line.Trim()) { continue }
    $parts = $line.Split(",") | ForEach-Object { $_.Trim() }
    if ($parts[0] -match '^(\d+)\s*-\s*(.*)$') {
        $m = [regex]::Match($parts[0], '^(\d+)\s*-\s*(.*)$')
        $id = $m.Groups[1].Value.Trim(); $name = $m.Groups[2].Value.Trim()
        if (-not $employees.ContainsKey($id)) { $employees[$id] = @{ id = $id; name = $name; days = @{} } }
        $currentEmp = $employees[$id]; $lastDate = $null
        continue
    }
    if ($parts[0] -match '^(\d{1,2})/(\d{1,2})/(\d{4})$') {
        $m = [regex]::Match($parts[0], '^(\d{1,2})/(\d{1,2})/(\d{4})$')
        $lastDate = "$($m.Groups[3].Value)-$($m.Groups[2].Value.PadLeft(2, '0'))-$($m.Groups[1].Value.PadLeft(2, '0'))"
        if ($currentEmp -and -not $currentEmp.days.ContainsKey($lastDate)) { $currentEmp.days[$lastDate] = New-Object System.Collections.Generic.List[string] }
        continue
    }
    if ($currentEmp -and $lastDate -and $parts[0] -eq "") {
        foreach ($p in $parts) { if ($p -match '^\d{1,2}:\d{2}$') { $currentEmp.days[$lastDate].Add($p) } }
    }
}

$css = "body { font-family: 'Segoe UI', sans-serif; font-size: 11px; margin: 0; padding: 20px; color: #1e293b; background: #f8fafc; } " +
       ".page { background: #fff; width: 210mm; min-height: 297mm; padding: 20px; margin: 0 auto 30px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border-radius: 8px; position: relative; box-sizing: border-box; page-break-after: always; } " +
       ".header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 20px; } " +
       ".header-info h1 { color: #1e3a8a; font-size: 24px; margin: 0; font-weight: 800; text-transform: uppercase; } " +
       ".emp-box { background: #f1f5f9; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; display: flex; gap: 40px; border-left: 4px solid #1e3a8a; } " +
       "table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } " +
       "th { background: #1e3a8a; color: #fff; padding: 10px; font-size: 9px; border: 1px solid #1e3a8a; } " +
       "td { padding: 8px; border: 1px solid #e2e8f0; text-align: center; } " +
       ".total-row { background: #eff6ff; font-weight: 700; color: #1e3a8a; } " +
       ".sig { width: 220px; text-align: center; border-top: 1px solid #1e293b; padding-top: 8px; font-weight: 600; } " +
       ".missing { color: #ef4444; font-style: italic; font-weight: 600; font-size: 9px; } "

$html = "<html><head><style>$css</style></head><body>"
$html += "<div class='no-print' style='text-align:center;padding:20px;'><button onclick='window.print()' style='padding:12px 24px;background:#1e3a8a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;'>Gerar PDF / Imprimir</button></div>"

$sortedIds = $employees.Keys | Sort-Object { [int]$_ }

foreach ($id in $sortedIds) {
    $emp = $employees[$id]
    $totalWorkMin = 0; $totalOtMin = 0; $tableRows = ""
    $curr = $startDate
    while ($curr -le $endDate) {
        $key = $curr.ToString("yyyy-MM-dd")
        $rawPunches = if ($emp.days.ContainsKey($key)) { $emp.days[$key] } else { @() }
        $punches = @($rawPunches | Sort-Object { Get-Total-Minutes $_ })
        
        $isWk = ($curr.DayOfWeek -eq 'Saturday' -or $curr.DayOfWeek -eq 'Sunday')
        $entry = "-"; $exit = "-"; $duration = "-"; $ot = "-"
        
        if ($punches.Count -ge 2) {
            $entry = $punches[0]; $exit = $punches[-1]
            $dur = (Get-Total-Minutes $exit) - (Get-Total-Minutes $entry)
            if ($dur -gt 360) { $dur -= 60 }
            $totalWorkMin += $dur; $duration = Fmt-Hms $dur
            if ($dur -ge 486) { $extra = $dur - 485; $totalOtMin += $extra; $ot = "+$(Fmt-Hms $extra)" }
        } elseif ($punches.Count -eq 1) {
            $pMin = Get-Total-Minutes $punches[0]
            if ($pMin -lt 780) { # Before 13:00
                $entry = $punches[0]
                $exit = "<span class='missing'>Falta Sa&iacute;da</span>"
            } else { # After 13:00
                $entry = "<span class='missing'>Falta Entrada</span>"
                $exit = $punches[0]
            }
        }
        
        $rowStyle = if ($isWk -and $entry -eq "-") { "style='background:#f1f5f9;color:#94a3b8;'" } else { "" }
        $tableRows += "<tr $rowStyle><td>$($curr.ToString('dd/MM/yyyy'))</td><td>$entry</td><td>$exit</td><td>$duration</td><td>$ot</td></tr>"
        $curr = $curr.AddDays(1)
    }

    $safeName = Html-Encode-Safe $emp.name
    $html += "<div class='page'><div class='header'><div class='header-info'><h1>Pontual | VE Vontade e Empenho</h1><p>Relat&oacute;rio de Assiduidade Mensal</p></div></div>"
    $html += "<div class='emp-box'><div><strong>Colaborador</strong><span>$safeName</span></div><div><strong>ID</strong><span>$id</span></div><div><strong>Per&iacute;odo</strong><span>31/03/2026 a 30/04/2026</span></div></div>"
    $html += "<table><thead><tr><th>Data</th><th>Entrada</th><th>Sa&iacute;da</th><th>Dura&ccedil;&atilde;o</th><th>Horas Extra</th></tr></thead><tbody>$tableRows</tbody>"
    $html += "<tfoot><tr class='total-row'><td colspan='3' style='text-align:right'>TOTAL DO PER&Iacute;ODO:</td><td>$(Fmt-Hms $totalWorkMin)</td><td>$(Fmt-Hms $totalOtMin)</td></tr></tfoot></table>"
    $html += "<div class='sigs' style='display:flex;justify-content:space-between;margin-top:50px;'><div class='sig'>Assinatura do Colaborador</div><div class='sig'>Assinatura do Respons&aacute;vel</div></div></div>"
}

$html += "</body></html>"
[System.IO.File]::WriteAllText((Join-Path $outputDir "Relatorio_VE_Final.html"), $html, [System.Text.Encoding]::UTF8)
Write-Host "Relatório VE Final gerado com sucesso com detecção inteligente de Entrada/Saída!"
