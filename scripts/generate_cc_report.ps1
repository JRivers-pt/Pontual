# Premium Cozinha Criativa (Gengibre) Report Generator
$recordsFile = "C:\Users\JD\Documents\Pontual\Relatorios\Records_AllDepts_260525_to_260529_7502.xls"
$outputDir = "C:\Users\JD\Documents\Pontual\Relatorios"

$startDate = Get-Date "2026-05-25"
$endDate = Get-Date "2026-05-29"

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
    return "$($h)h $($m.ToString('00'))m"
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
        $empM = [regex]::Match($val, '^^(\d+)\s*-\s*(.*)$')
        $id = $empM.Groups[1].Value.Trim()
        $name = $empM.Groups[2].Value.Trim()
        
        # Exclude Vasco and Manager
        if ($name -match '(?i)vasco|jd|joão|joao|gestor|gerente|admin') { continue }
        
        # Filter for Gengibre IDs (usually 11, 16, 17, 18 or others in the XLS)
        # Based on previous sessions, Gengibre employees are in the CC client.
        # We will process ALL in this file since it's the Gengibre export.
        if (-not $employees.ContainsKey($id)) { $employees[$id] = @{ id = $id; name = $name; days = @{} } }
        $currentEmp = $employees[$id]
        $currentDate = $null
        continue
    }
    
    if ($val -match '^(\d{1,2})/(\d{1,2})/(\d{4})$') {
        $dm = [regex]::Match($val, '^(\d{1,2})/(\d{1,2})/(\d{4})$')
        # Format is MM/DD/YYYY in this XLS
        $currentDate = "$($dm.Groups[3].Value)-$($dm.Groups[1].Value.PadLeft(2, '0'))-$($dm.Groups[2].Value.PadLeft(2, '0'))"
        if ($currentEmp -and -not $currentEmp.days.ContainsKey($currentDate)) { $currentEmp.days[$currentDate] = New-Object System.Collections.Generic.List[string] }
        continue
    }
    
    if ($val -match '^\d{1,2}:\d{2}$') {
        if ($currentEmp -and $currentDate) { $currentEmp.days[$currentDate].Add($val) }
    }
}

$css = "body { font-family: 'Segoe UI', sans-serif; font-size: 13px; margin: 0; padding: 20px; color: #1e293b; background: #f1f5f9; } " +
       ".page { background: #fff; width: 210mm; min-height: 297mm; padding: 40px; margin: 0 auto 30px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); position: relative; box-sizing: border-box; page-break-after: always; } " +
       ".header h1 { color: #1e3a8a; font-size: 26px; margin: 0; font-weight: 800; } " +
       ".header-info { margin-bottom: 25px; color: #64748b; font-size: 14px; } " +
       "table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } " +
       "th { background: #1e3a8a; color: #fff; padding: 12px; font-size: 12px; border: 1px solid #1e3a8a; text-transform: uppercase; } " +
       "td { padding: 10px; border: 1px solid #e2e8f0; text-align: center; font-size: 13px; } " +
       "tr:nth-child(even) { background: #f8fafc; } " +
       ".sigs { display: flex; justify-content: space-between; margin-top: 60px; padding: 0 20px; } " +
       ".sig { width: 240px; text-align: center; border-top: 2px solid #1e293b; padding-top: 10px; font-weight: 600; font-size: 13px; } " +
       ".missing { color: #ef4444; font-style: italic; font-weight: 600; } " +
       ".exempt-note { margin-top: 15px; padding: 10px; border-left: 4px solid #1e3a8a; background: #f1f5f9; font-weight: 600; } "

$html = "<html><head><style>$css</style></head><body>"
$html += "<div class='no-print' style='text-align:center;padding:20px;'><button onclick='window.print()' style='padding:12px 24px;background:#1e3a8a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:16px;'>Gerar PDF / Imprimir</button></div>"

$sortedIds = $employees.Keys | Sort-Object { [int]$_ }

$csvContent = @()

foreach ($id in $sortedIds) {
    $emp = $employees[$id]
    $totalOtMin = 0; $tableRows = ""; $csvLines = @()
    $curr = $startDate
    while ($curr -le $endDate) {
        $key = $curr.ToString("yyyy-MM-dd")
        $rawPunches = if ($emp.days.ContainsKey($key)) { $emp.days[$key] } else { @() }
        $punches = @($rawPunches | Sort-Object { Get-Total-Minutes $_ })
        
        $isWk = ($curr.DayOfWeek -eq 'Saturday' -or $curr.DayOfWeek -eq 'Sunday')
        $entry = "-"; $exit = "-"; $duration = "-"; $ot = "-"; $state = if ($isWk) { "FDS" } else { "Falta" }; $obs = "-"
        
        if ($punches.Count -ge 2) {
            $entry = $punches[0]; $exit = $punches[-1]
            $entryHtml = $entry; $exitHtml = $exit
            $rawDur = (Get-Total-Minutes $exit) - (Get-Total-Minutes $entry)
            
            if ($rawDur -le 15) { # 15 mins or less difference is a double punch error
                if ($rawDur -eq 0) { $duration = "-" } else { $duration = Fmt-Hms $rawDur }
                $obs = "<span class='missing'>Erro: Dupla picagem</span>"
                $state = "Presente"
            } else {
                $dur = $rawDur
                if ($dur -gt 360) { $dur -= 60 } # Lunch
                $duration = Fmt-Hms $dur
                $state = "Presente"
                # Gengibre Rule: 8h work, 15m tolerance
                if ($dur -gt 495) { # > 8h15m
                    $extra = $dur - 480
                    $totalOtMin += $extra
                    $ot = "+$(Fmt-Hms $extra)"
                }
            }
        } elseif ($punches.Count -eq 1) {
            $pMin = Get-Total-Minutes $punches[0]
            if ($pMin -lt 780) { # Before 13:00
                $entry = $punches[0]; $exit = "Falta Saida"
                $entryHtml = $entry; $exitHtml = "<span class='missing'>Falta Sa&iacute;da</span>"
                $obs = "<span class='missing'>Falta picagem Sa&iacute;da</span>"
            } else { # After 13:00
                $entry = "Falta Entrada"; $exit = $punches[0]
                $entryHtml = "<span class='missing'>Falta Entrada</span>"; $exitHtml = $exit
                $obs = "<span class='missing'>Falta picagem Entrada</span>"
            }
            $state = "Presente"
        } else {
            $entry = "-"; $exit = "-"; $entryHtml = "-"; $exitHtml = "-"
            if (-not $isWk) { $obs = "<span class='missing'>Falta picagem Entrada e Sa&iacute;da</span>" }
        }
        
        $tableRows += "<tr><td>$($curr.ToString('dd/MM'))</td><td>$entryHtml</td><td>$exitHtml</td><td>$duration</td><td>$ot</td><td>$state</td><td>$obs</td></tr>"
        $csvObs = ($obs -replace "<[^>]+>", "") -replace "&iacute;", "i"
        $csvLines += "$($curr.ToString('dd/MM'));$entry;$exit;$duration;$ot;$state;$csvObs"
        $curr = $curr.AddDays(1)
    }

    $isExempt = ($id -eq "11" -or $id -eq "18")
    $safeName = Html-Encode-Safe $emp.name
    $html += "<div class='page'><div class='header'><h1>Pontual | Cozinha Criativa (Gengibre)</h1></div>"
    $html += "<div class='header-info'>Colaborador: <b>$safeName ($id)</b><br>Per&iacute;odo: $($startDate.ToString('dd/MM')) a $($endDate.ToString('dd/MM/yyyy'))<br>Gerado em: $(Get-Date -Format 'dd/MM/yyyy HH:mm')</div>"
    $html += "<table><thead><tr><th>Data</th><th>Entrada</th><th>Sa&iacute;da</th><th>Dura&ccedil;&atilde;o</th><th>H. Extra</th><th>Estado</th><th>Observa&ccedil;&otilde;es</th></tr></thead><tbody>$tableRows</tbody>"
    
    $html += "</table><div style='font-size: 15px;'><b>Total Horas Extra: $(Fmt-Hms $totalOtMin)</b></div>"
    
    if ($isExempt) {
        $exemptionLimit = 20 * 60 # 20h
        $payableMin = [Math]::Max(0, $totalOtMin - $exemptionLimit)
        $html += "<div class='exempt-note'>Isen&ccedil;&atilde;o Aplicada: -20h<br>Horas Extra a Pagar: $(Fmt-Hms $payableMin)</div>"
    }
    
    $html += "<div class='sigs'><div class='sig'>Assinatura do Colaborador</div><div class='sig'>Assinatura do Respons&aacute;vel</div></div></div>"
    
    # CSV Data for this employee
    $csvContent += "Colaborador: $($emp.name) ($id)"
    $csvContent += "Data;Entrada;Saida;Duracao;H. Extra;Estado;Observacoes"
    $csvLines | ForEach-Object { $csvContent += $_ }
    $csvContent += "TOTAL HORAS EXTRA;;;;$(Fmt-Hms $totalOtMin);"
    if ($isExempt) {
        $exemptionLimit = 20 * 60
        $payableMin = [Math]::Max(0, $totalOtMin - $exemptionLimit)
        $csvContent += "Isencao Aplicada: -20h;;;;;"
        $csvContent += "Horas Extra a Pagar;;;;$(Fmt-Hms $payableMin);"
    }
    $csvContent += "" # Blank line
}

$html += "</body></html>"
[System.IO.File]::WriteAllText((Join-Path $outputDir "Relatorio_CC_W1Pro_Extra.html"), $html, [System.Text.Encoding]::UTF8)

# Save CSV (with UTF8 BOM and 'sep=;' for automatic Excel delimiter recognition)
$csvFile = Join-Path $outputDir "Relatorio_CC_W1Pro_Extra.csv"
$utf8bom = New-Object System.Text.UTF8Encoding($true)
$csvFinalContent = @("sep=;") + $csvContent
[System.IO.File]::WriteAllLines($csvFile, $csvFinalContent, $utf8bom)

Write-Host "Relatórios Gengibre (CC) gerados com sucesso:"
Write-Host " - HTML: $($outputDir)\Relatorio_CC_W1Pro_Extra.html"
Write-Host " - CSV:  $($csvFile)"
