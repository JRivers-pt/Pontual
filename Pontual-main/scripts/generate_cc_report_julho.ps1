$recordsFile1 = "C:\Users\JD\Downloads\CurrentData_AllDepts_260626_to_260725_7502.xls"
$recordsFile2 = "C:\Users\JD\Downloads\CurrentData_AllDepts_260626_to_260725_7502.xls"
$outputDir = "C:\Users\JD\Documents\Pontual\Relatorios"

$startDate = Get-Date "2026-06-26"
$endDate = Get-Date "2026-07-25"

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

$cellRegex = '(?i)<td[^>]*>(.*?)<\/td>'
$trRegex = '(?s)<tr[^>]*>(.*?)<\/tr>'
$employees = @{}

function Parse-Records-File ($filePath) {
    if (-not (Test-Path $filePath)) {
        Write-Host "Warning: File not found: $filePath"
        return
    }
    
    $content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
    $isGrid = $content -match 'Punch In|Employee No\.'
    
    if ($isGrid) {
        $rowMatches = [regex]::Matches($content, $trRegex)
        foreach ($rm in $rowMatches) {
            $rowHtml = $rm.Groups[1].Value
            $tdMatches = [regex]::Matches($rowHtml, $cellRegex)
            if ($tdMatches.Count -lt 8) { continue }
            
            $name = ($tdMatches[0].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
            $id = ($tdMatches[1].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
            $dept = ($tdMatches[3].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
            $dateVal = ($tdMatches[4].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
            $punchIn = ($tdMatches[6].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
            $punchOut = ($tdMatches[7].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
            
            if ($id -match '^\d+$') {
                # Exclude Manager/Admin (but NOT Vasco Silva ID 10)
                if ($name -match '(?i)jd|joÃ£o|joao|gestor|gerente|admin') { continue }
                
                if (-not $employees.ContainsKey($id)) {
                    $employees[$id] = @{ id = $id; name = $name; days = @{} }
                }
                
                if ($dateVal -match '^(\d{1,2})/(\d{1,2})/(\d{4})$') {
                    $dm = [regex]::Match($dateVal, '^(\d{1,2})/(\d{1,2})/(\d{4})$')
                    $currentDate = "$($dm.Groups[3].Value)-$($dm.Groups[1].Value.PadLeft(2, '0'))-$($dm.Groups[2].Value.PadLeft(2, '0'))"
                    
                    if (-not $employees[$id].days.ContainsKey($currentDate)) {
                        $employees[$id].days[$currentDate] = New-Object System.Collections.Generic.List[string]
                    }
                    
                    if ($punchIn -match '^\d{1,2}:\d{2}$') {
                        if (-not $employees[$id].days[$currentDate].Contains($punchIn)) {
                            $employees[$id].days[$currentDate].Add($punchIn)
                        }
                    }
                    if ($punchOut -match '^\d{1,2}:\d{2}$') {
                        if (-not $employees[$id].days[$currentDate].Contains($punchOut)) {
                            $employees[$id].days[$currentDate].Add($punchOut)
                        }
                    }
                }
            }
        }
    } else {
        $matches = [regex]::Matches($content, $cellRegex)
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
                
                # Exclude Manager/Admin (but NOT Vasco Silva ID 10)
                if ($name -match '(?i)jd|joÃ£o|joao|gestor|gerente|admin') { continue }
                
                if (-not $employees.ContainsKey($id)) {
                    $employees[$id] = @{ id = $id; name = $name; days = @{} }
                }
                $currentEmp = $employees[$id]
                $currentDate = $null
                continue
            }
            
            if ($val -match '^(\d{1,2})/(\d{1,2})/(\d{4})$') {
                $dm = [regex]::Match($val, '^(\d{1,2})/(\d{1,2})/(\d{4})$')
                # Format is MM/DD/YYYY in this XLS
                $currentDate = "$($dm.Groups[3].Value)-$($dm.Groups[1].Value.PadLeft(2, '0'))-$($dm.Groups[2].Value.PadLeft(2, '0'))"
                if ($currentEmp) {
                    if (-not $currentEmp.days.ContainsKey($currentDate)) {
                        $currentEmp.days[$currentDate] = New-Object System.Collections.Generic.List[string]
                    }
                }
                continue
            }
            
            if ($val -match '^\d{1,2}:\d{2}$') {
                if ($currentEmp -and $currentDate) {
                    if (-not $currentEmp.days[$currentDate].Contains($val)) {
                        $currentEmp.days[$currentDate].Add($val)
                    }
                }
            }
        }
    }
}

Parse-Records-File $recordsFile1
Parse-Records-File $recordsFile2

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
       ".exempt-note { margin-top: 15px; padding: 10px; border-left: 4px solid #1e3a8a; background: #f1f5f9; font-weight: 600; } " +
       "@media print { .no-print { display: none !important; } body { background: none; padding: 0; margin: 0; } .page { margin: 0; box-shadow: none; page-break-after: always; width: 210mm; height: 297mm; } } " +
       "@page { size: A4; margin: 0; } "


$html = "<html><head><style>$css</style></head><body>"
$html += "<div class='no-print' style='text-align:center;padding:20px;'><button onclick='window.print()' style='padding:12px 24px;background:#1e3a8a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:16px;'>Gerar PDF / Imprimir</button></div>"

$sortedIds = $employees.Keys | Sort-Object { [int]$_ }

$csvContent = @()

foreach ($id in $sortedIds) {
    $emp = $employees[$id]
    $totalOtMin = 0; $totalWorkMin = 0; $tableRows = ""; $csvLines = @()
    $curr = $startDate
    while ($curr -le $endDate) {
        $key = $curr.ToString("yyyy-MM-dd")
        $rawPunches = if ($emp.days.ContainsKey($key)) { $emp.days[$key] } else { @() }
        $punches = @($rawPunches | Sort-Object { Get-Total-Minutes $_ })
        
        $isWk = ($curr.DayOfWeek -eq 'Saturday' -or $curr.DayOfWeek -eq 'Sunday')
        $isHoliday = ($curr.Month -eq 6 -and $curr.Day -eq 10)
        
        $entry = "-"; $exit = "-"; $duration = "-"; $ot = "-"; 
        $state = if ($isWk) { "FDS" } elseif ($isHoliday) { "Feriado" } else { "Falta" }
        $obs = if ($isHoliday) { "Feriado" } else { "-" }
        
        if ($punches.Count -ge 2) {
            $entry = $punches[0]; $exit = $punches[-1]
            $entryHtml = $entry; $exitHtml = $exit
            $rawDur = (Get-Total-Minutes $exit) - (Get-Total-Minutes $entry)
            
            if ($rawDur -le 15) { # 15 mins or less difference is a double punch error
                if ($rawDur -eq 0) { $duration = "-" } else { $duration = Fmt-Hms $rawDur }
                $obs = if ($isHoliday) { "Feriado (Erro: Dupla picagem)" } else { "<span class='missing'>Erro: Dupla picagem</span>" }
                $state = "Presente"
            } else {
                $dur = $rawDur
                if ($dur -gt 360) { $dur -= 60 } # Lunch
                $duration = Fmt-Hms $dur
                $state = "Presente"
                $obs = if ($isHoliday) { "Feriado" } else { "-" }
                $totalWorkMin += $dur
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
                $obs = if ($isHoliday) { "Feriado (Falta picagem Sa&iacute;da)" } else { "<span class='missing'>Falta picagem Sa&iacute;da</span>" }
            } else { # After 13:00
                $entry = "Falta Entrada"; $exit = $punches[0]
                $entryHtml = "<span class='missing'>Falta Entrada</span>"; $exitHtml = $exit
                $obs = if ($isHoliday) { "Feriado (Falta picagem Entrada)" } else { "<span class='missing'>Falta picagem Entrada</span>" }
            }
            $state = "Presente"
        } else {
            $entry = "-"; $exit = "-"; $entryHtml = "-"; $exitHtml = "-"
            if (-not $isWk -and -not $isHoliday) { 
                $obs = "<span class='missing'>Falta picagem Entrada e Sa&iacute;da</span>" 
            }
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
    
    $tfoot = "<tfoot><tr style='font-weight: bold; background: #eff6ff; color: #1e3a8a;'><td colspan='3' style='text-align:right;'>TOTAL DO PER&Iacute;ODO:</td><td>$(Fmt-Hms $totalWorkMin)</td><td>$(Fmt-Hms $totalOtMin)</td><td colspan='2'></td></tr>"
    if ($isExempt) {
        $exemptionLimit = 20 * 60 # 20h
        $payableMin = [Math]::Max(0, $totalOtMin - $exemptionLimit)
        $tfoot += "<tr style='font-weight: bold; background: #f1f5f9; color: #475569;'><td colspan='3' style='text-align:right;'>Isen&ccedil;&atilde;o Aplicada:</td><td></td><td>-20h 00m</td><td colspan='2'></td></tr>"
        $tfoot += "<tr style='font-weight: bold; background: #fef2f2; color: #b91c1c;'><td colspan='3' style='text-align:right;'>Horas Extra a Pagar:</td><td></td><td>$(Fmt-Hms $payableMin)</td><td colspan='2'></td></tr>"
    }
    $tfoot += "</tfoot>"
    
    $html += "<table><thead><tr><th>Data</th><th>Entrada</th><th>Sa&iacute;da</th><th>Dura&ccedil;&atilde;o</th><th>H. Extra</th><th>Estado</th><th>Observa&ccedil;&otilde;es</th></tr></thead><tbody>$tableRows</tbody>$tfoot</table>"
    
    $html += "<div class='sigs'><div class='sig'>Assinatura do Colaborador</div><div class='sig'>Assinatura do Respons&aacute;vel</div></div></div>"
    
    # CSV Data for this employee
    $csvContent += "Colaborador: $($emp.name) ($id)"
    $csvContent += "Data;Entrada;Saida;Duracao;H. Extra;Estado;Observacoes"
    $csvLines | ForEach-Object { $csvContent += $_ }
    $csvContent += "TOTAL DO PERIODO;;;$(Fmt-Hms $totalWorkMin);$(Fmt-Hms $totalOtMin);;"
    if ($isExempt) {
        $exemptionLimit = 20 * 60
        $payableMin = [Math]::Max(0, $totalOtMin - $exemptionLimit)
        $csvContent += "Isencao Aplicada;;;;-20h 00m;;"
        $csvContent += "Horas Extra a Pagar;;;;$(Fmt-Hms $payableMin);;"
    }
    $csvContent += "" # Blank line
}

$html += "</body></html>"

$htmlFile = Join-Path $outputDir "Relatorio_CC_Julho.html"
$csvFile = Join-Path $outputDir "Relatorio_CC_Julho.csv"

[System.IO.File]::WriteAllText($htmlFile, $html, [System.Text.Encoding]::UTF8)

# Save CSV (with UTF8 BOM and 'sep=;' for automatic Excel delimiter recognition)
$utf8bom = New-Object System.Text.UTF8Encoding($true)
$csvFinalContent = @("sep=;") + $csvContent
[System.IO.File]::WriteAllLines($csvFile, $csvFinalContent, $utf8bom)

Write-Host "RelatÃ³rios Gengibre (CC) gerados com sucesso:"
Write-Host " - HTML: $htmlFile"
Write-Host " - CSV:  $csvFile"

# Convert HTML to PDF using Edge in headless mode
$pdfFile = "C:\Users\JD\Documents\Relatorio Julho CCGengibre.pdf"
$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (Test-Path $edgePath) {
    Write-Host "A converter para PDF usando o Edge..."
    Start-Process -FilePath $edgePath -ArgumentList "--headless", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf=`"$pdfFile`"", "`"$htmlFile`"" -Wait
    Write-Host "PDF gerado em: $pdfFile"
} else {
    Write-Host "Aviso: Microsoft Edge nÃ£o encontrado em $edgePath. PDF nÃ£o gerado automaticamente."
}
