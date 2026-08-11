# Robust 100% ASCII PowerShell implementation of VE report generator for multiple months
$currentDataFile = "C:\Users\JD\Downloads\CurrentData_AllDepts_260630_to_260731_5567.xls"
$outputDir = "C:\Users\JD\Documents\Pontual\Relatorios"

$reportPeriods = @(
    @{
        MonthName = "Julho"
        StartDate = Get-Date "2026-06-30"
        EndDate = Get-Date "2026-07-31"
        RecordsFile = "C:\Users\JD\Downloads\CurrentData_AllDepts_260630_to_260731_5567.xls"
        PeriodStr = "30/06/2026 a 31/07/2026"
    }
)
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

# 1. Parse CurrentData to extract VE employee IDs and preserve correct Names
Write-Host "Extraindo departamentos do ficheiro de metadados..."
$contentMetadata = [System.IO.File]::ReadAllText($currentDataFile, [System.Text.Encoding]::UTF8)
$cellRegex = '(?i)<td[^>]*>(.*?)<\/td>'
$trRegex = '(?s)<tr[^>]*>(.*?)<\/tr>'

$veEmployeeNames = @{} # id -> name map
$rowMatches = [regex]::Matches($contentMetadata, $trRegex)

foreach ($rm in $rowMatches) {
    $rowHtml = $rm.Groups[1].Value
    $tdMatches = [regex]::Matches($rowHtml, $cellRegex)
    if ($tdMatches.Count -lt 4) { continue }
    
    $cell0 = ($tdMatches[0].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
    $cell1 = ($tdMatches[1].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
    
    $id = ""
    $name = ""
    $dept = ""
    
    if ($cell1 -match '^\d+$') {
        $id = $cell1
        $name = $cell0
        $dept = ($tdMatches[3].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
    } elseif ($cell0 -match '^\d+$') {
        $id = $cell0
        $dept = ($tdMatches[2].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
    }
    
    if ($id -and $dept -eq "VE") {
        if ($name) {
            $veEmployeeNames[$id] = $name
        } elseif (-not $veEmployeeNames.ContainsKey($id)) {
            $veEmployeeNames[$id] = "Colaborador $id"
        }
    }
}

Write-Host "IDs de colaboradores VE detectados: $($veEmployeeNames.Keys -join ', ')"

# 2. Loop through each period and generate output
foreach ($period in $reportPeriods) {
    $monthName = $period.MonthName
    $startDate = $period.StartDate
    $endDate = $period.EndDate
    $recordsFile = $period.RecordsFile
    $periodStr = $period.PeriodStr
    
    Write-Host "A processar o mÃªs de $monthName com o ficheiro $recordsFile..."
    
    if (-not (Test-Path $recordsFile)) {
        Write-Warning "Ficheiro de registos nÃ£o encontrado para $monthName em $recordsFile. A saltar..."
        continue
    }
    
    $contentRecords = [System.IO.File]::ReadAllText($recordsFile, [System.Text.Encoding]::UTF8)
    $cellMatches = [regex]::Matches($contentRecords, $cellRegex)

    $employees = @{}
    $currentEmp = $null
    $currentDate = $null

    foreach ($m in $cellMatches) {
        $val = $m.Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', ''
        $val = $val.Trim()
        if (-not $val) { continue }
        
        # ID-Name detection (e.g. "1-Jos Vaz")
        if ($val -match '^(\d+)\s*-\s*(.*)$') {
            $empM = [regex]::Match($val, '^(\d+)\s*-\s*(.*)$')
            $id = $empM.Groups[1].Value.Trim()
            
            # Only process if employee belongs to VE department
            if ($veEmployeeNames.ContainsKey($id)) {
                if (-not $employees.ContainsKey($id)) {
                    # Use the clean name from the metadata file if available
                    $name = $veEmployeeNames[$id]
                    $employees[$id] = @{ id = $id; name = $name; days = @{} }
                }
                $currentEmp = $employees[$id]
            } else {
                $currentEmp = $null
            }
            $currentDate = $null
            continue
        }
        
        # Date detection
        if ($val -match '^(\d{1,2})/(\d{1,2})/(\d{4})$') {
            if ($currentEmp) {
                $dm = [regex]::Match($val, '^(\d{1,2})/(\d{1,2})/(\d{4})$')
                $currentDate = "$($dm.Groups[3].Value)-$($dm.Groups[2].Value.PadLeft(2, '0'))-$($dm.Groups[1].Value.PadLeft(2, '0'))"
                if (-not $currentEmp.days.ContainsKey($currentDate)) {
                    $currentEmp.days[$currentDate] = New-Object System.Collections.Generic.List[string]
                }
            }
            continue
        }
        
        # Punch time detection
        if ($val -match '^\d{1,2}:\d{2}$') {
            if ($currentEmp -and $currentDate) {
                if (-not $currentEmp.days[$currentDate].Contains($val)) {
                    $currentEmp.days[$currentDate].Add($val)
                }
            }
        }
        } # END OF CELLMATCHES LOOP

    # --- INJECT MANUAL CORRECTIONS HERE ---
    Write-Host "Injecting manual correction for Duarte Pestana (6) on 30/07/2026 08:30..."
    if ($employees.ContainsKey("6")) {
        if (-not $employees["6"].days.ContainsKey("2026-07-30")) {
            $employees["6"].days["2026-07-30"] = New-Object System.Collections.Generic.List[string]
        }
        if (-not $employees["6"].days["2026-07-30"].Contains("08:30")) {
            $employees["6"].days["2026-07-30"].Add("08:30")
            $employees["6"].days["2026-07-30"].Sort()
        }
    }
    # --------------------------------------

    # Generate HTML and CSV contents
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
           ".missing { color: #ef4444; font-style: italic; font-weight: 600; font-size: 10px; } " +
           "@media print { .no-print { display: none !important; } body { background: none; padding: 0; margin: 0; } .page { margin: 0; box-shadow: none; border-radius: 0; page-break-after: always; width: 210mm; height: 297mm; } } "

    $html = "<html><head><style>$css</style></head><body>"
    $html += "<div class='no-print' style='text-align:center;padding:20px;'><button onclick='window.print()' style='padding:12px 24px;background:#1e3a8a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;'>Gerar PDF / Imprimir</button></div>"

    $csv = "sep=;`nData;Entrada;Saida;Duracao;H. Extra;Estado`n"
    $sortedIds = $employees.Keys | Sort-Object { [int]$_ }

    foreach ($id in $sortedIds) {
        $emp = $employees[$id]
        $csv += "Colaborador: $($emp.name) ($id)`n"
        $totalWorkMin = 0; $totalOtMin = 0; $tableRows = ""
        $curr = $startDate
        while ($curr -le $endDate) {
            $key = $curr.ToString("yyyy-MM-dd")
            $punches = @(if ($emp.days.ContainsKey($key)) { $emp.days[$key] | Where-Object { $_ -like "*:*" } } else { @() })
            $isWk = ($curr.DayOfWeek -eq 'Saturday' -or $curr.DayOfWeek -eq 'Sunday')
            $entry = "-"; $exit = "-"; $duration = "-"; $ot = "-"
            
            if ($punches.Count -ge 2) {
                $sorted = $punches | Sort-Object { Get-Total-Minutes $_ }
                $entry = $sorted[0]; $exit = $sorted[-1]
                $dur = (Get-Total-Minutes $exit) - (Get-Total-Minutes $entry)
                if ($dur -gt 360) { $dur -= 60 } # Lunch
                $totalWorkMin += $dur; $duration = Fmt-Hms $dur
                # VE Overtime: Cap at 8h (480m), tolerance 5m (trigger >= 486m). Extra = dur - 485
                if ($dur -ge 486) {
                    $extra = $dur - 485
                    $totalOtMin += $extra
                    $ot = "+$(Fmt-Hms $extra)"
                }
            } elseif ($punches.Count -eq 1) {
                $pMin = Get-Total-Minutes $punches[0]
                if ($pMin -lt 780) { # Before 13:00
                    $entry = $punches[0]
                    $exit = "<span class='missing'>Falta Sa&iacute;da</span>"
                } else {
                    $entry = "<span class='missing'>Falta Entrada</span>"
                    $exit = $punches[0]
                }
            }
            
            $rowStyle = if ($isWk -and $entry -eq "-") { "style='background:#f1f5f9;color:#94a3b8;'" } else { "" }
            $estado = if ($isWk -and $entry -eq "-") { "FDS" } elseif ($entry -eq "-") { "Falta" } else { "Presente" }
            $tableRows += "<tr $rowStyle><td>$($curr.ToString('dd/MM/yyyy'))</td><td>$entry</td><td>$exit</td><td>$duration</td><td>$ot</td></tr>"
            $csv += "$($curr.ToString('dd/MM/yyyy'));$entry;$exit;$duration;$ot;$estado`n"
            $curr = $curr.AddDays(1)
        }

        $safeName = Html-Encode-Safe $emp.name
        $html += "<div class='page'><div class='header'><div class='header-info'><h1>Pontual | VE Vontade e Empenho</h1><p>Relat&oacute;rio de Assiduidade Mensal</p></div></div>"
        $html += "<div class='emp-box'><div><strong>Colaborador</strong><span>$safeName</span></div><div><strong>ID</strong><span>$id</span></div><div><strong>Per&iacute;odo</strong><span>$periodStr</span></div></div>"
        $html += "<table><thead><tr><th>Data</th><th>Entrada</th><th>Sa&iacute;da</th><th>Dura&ccedil;&atilde;o</th><th>Horas Extra</th></tr></thead><tbody>$tableRows</tbody>"
        $html += "<tfoot><tr class='total-row'><td colspan='3' style='text-align:right'>TOTAL DO PER&Iacute;ODO:</td><td>$(Fmt-Hms $totalWorkMin)</td><td>$(Fmt-Hms $totalOtMin)</td></tr></tfoot></table>"
        $html += "<div class='sigs'><div class='sig'>Assinatura do Colaborador</div><div class='sig'>Assinatura do Respons&aacute;vel</div></div></div>"
        $csv += "TOTAL HORAS EXTRA;;;;$(Fmt-Hms $totalOtMin);`n`n"
    }

    $html += "</body></html>"
    
    $htmlPath = Join-Path $outputDir "Relatorio_VE_$monthName.html"
    $csvPath = Join-Path $outputDir "Relatorio_VE_$monthName.csv"
    
    [System.IO.File]::WriteAllText($htmlPath, $html, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($csvPath, $csv, [System.Text.Encoding]::UTF8)
    
    Write-Host "âœ… RelatÃ³rios de $monthName gerados com sucesso!"
    Write-Host "   -> $htmlPath"
    Write-Host "   -> $csvPath"
}
