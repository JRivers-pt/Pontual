$recordsFile = "C:\Users\JD\Downloads\Records_AllDepts_260726_to_260809_7502.xls"
$outputDir = "C:\Users\JD\Documents\Pontual\Relatorios"

Write-Host "A processar o ficheiro Records para Gengibre..."

if (-not (Test-Path $recordsFile)) {
    Write-Warning "Ficheiro não encontrado: $recordsFile"
    exit
}

$contentRecords = [System.IO.File]::ReadAllText($recordsFile, [System.Text.Encoding]::UTF8)
$cellRegex = '(?i)<td[^>]*>(.*?)<\/td>'
$cellMatches = [regex]::Matches($contentRecords, $cellRegex)

$employees = @{}
$currentEmp = $null
$currentDate = $null

foreach ($m in $cellMatches) {
    $val = $m.Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', ''
    $val = $val.Trim()
    if (-not $val) { continue }
    
    # ID-Name detection (e.g. "1-Wellington Silva")
    if ($val -match '^(\d+)\s*-\s*(.*)$') {
        $empM = [regex]::Match($val, '^(\d+)\s*-\s*(.*)$')
        $id = $empM.Groups[1].Value.Trim()
        $name = $empM.Groups[2].Value.Trim()
        
        if (-not $employees.ContainsKey($id)) {
            $employees[$id] = @{ id = $id; name = $name; days = @{} }
        }
        $currentEmp = $employees[$id]
        $currentDate = $null
        continue
    }
    
    # Date detection
    if ($val -match '^(\d{1,2})/(\d{1,2})/(\d{4})$') {
        if ($currentEmp) {
            $dm = [regex]::Match($val, '^(\d{1,2})/(\d{1,2})/(\d{4})$')
            # The Records file uses MM/DD/YYYY
            $currentDate = "$($dm.Groups[3].Value)-$($dm.Groups[1].Value.PadLeft(2, '0'))-$($dm.Groups[2].Value.PadLeft(2, '0'))"
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
}

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

$css = "body { font-family: 'Segoe UI', sans-serif; font-size: 11px; margin: 0; padding: 20px; color: #1e293b; background: #f8fafc; } " +
       ".page { background: #fff; width: 210mm; min-height: 297mm; padding: 20px; margin: 0 auto 30px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border-radius: 8px; position: relative; box-sizing: border-box; page-break-after: always; } " +
       ".header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 20px; } " +
       ".header-info h1 { color: #1e3a8a; font-size: 24px; margin: 0; font-weight: 800; text-transform: uppercase; } " +
       ".emp-box { background: #f1f5f9; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; display: flex; gap: 40px; border-left: 4px solid #1e3a8a; } " +
       ".emp-box strong { color: #1e3a8a; text-transform: uppercase; font-size: 10px; display: block; } " +
       ".emp-box span { font-size: 14px; font-weight: 600; } " +
       "table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } " +
       "th { background: #1e3a8a; color: #fff; padding: 10px; font-size: 9px; border: 1px solid #1e3a8a; } " +
       "td { padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-size: 10px; } " +
       ".total-row { background: #eff6ff; font-weight: 700; color: #1e3a8a; } " +
       ".obs { color: #d97706; font-weight: 600; font-size: 9px; } " +
       "@media print { .no-print { display: none !important; } body { background: none; padding: 0; margin: 0; } .page { margin: 0; box-shadow: none; border-radius: 0; page-break-after: always; width: 210mm; height: 297mm; } } "

$html = "<html><head><style>$css</style><meta charset='UTF-8'></head><body>"
$html += "<div class='no-print' style='text-align:center;padding:20px;'><button onclick='window.print()' style='padding:12px 24px;background:#1e3a8a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;'>Gerar PDF / Imprimir</button></div>"

$startDate = Get-Date "2026-07-26"
$endDate = Get-Date "2026-08-09"

$sortedIds = $employees.Keys | Sort-Object { [int]$_ }

foreach ($id in $sortedIds) {
    $emp = $employees[$id]
    $totalWorkMin = 0; $totalOtMin = 0; $tableRows = ""
    $curr = $startDate
    while ($curr -le $endDate) {
        $key = $curr.ToString("yyyy-MM-dd")
        $isWk = ($curr.DayOfWeek -eq 'Saturday' -or $curr.DayOfWeek -eq 'Sunday')
        $e1 = "-"; $s1 = "-"; $e2 = "-"; $s2 = "-"; $duration = "-"; $ot = "-"; $obs = ""
        $dur = 0
        
        if ($emp.days.ContainsKey($key)) {
            $rawPunches = $emp.days[$key] | Sort-Object { Get-Total-Minutes $_ }
            $validPunches = @()
            
            foreach ($p in $rawPunches) {
                if ($validPunches.Count -eq 0) {
                    $validPunches += $p
                } else {
                    $prev = Get-Total-Minutes $validPunches[-1]
                    $current = Get-Total-Minutes $p
                    if (($current - $prev) -ge 15) {
                        $validPunches += $p
                    } else {
                        $obs = "Dupla Picagem"
                    }
                }
            }
            
            $pc = $validPunches.Count
            if ($pc -ge 4) {
                $e1 = $validPunches[0]
                $s1 = $validPunches[1]
                $e2 = $validPunches[2]
                $s2 = $validPunches[-1]
                $dur = ((Get-Total-Minutes $s1) - (Get-Total-Minutes $e1)) + ((Get-Total-Minutes $s2) - (Get-Total-Minutes $e2))
            } elseif ($pc -eq 3) {
                $e1 = $validPunches[0]
                $s1 = $validPunches[1]
                $e2 = $validPunches[2]
                $dur = ((Get-Total-Minutes $s1) - (Get-Total-Minutes $e1))
                $obs = "Falta picagem"
            } elseif ($pc -eq 2) {
                $e1 = $validPunches[0]
                $s2 = $validPunches[1]
                $dur = (Get-Total-Minutes $s2) - (Get-Total-Minutes $e1)
                if ($dur -gt 360) {
                    $dur -= 60
                    if ($obs) { $obs += " / " }
                    $obs += "Dedu&ccedil;&atilde;o Auto 1h"
                }
            } elseif ($pc -eq 1) {
                $e1 = $validPunches[0]
                $obs = "Falta picagem"
            }
            
            if ($dur -gt 0) {
                $totalWorkMin += $dur; $duration = Fmt-Hms $dur
                # Overtime: Cap at 8h (480m), tolerance 5m (trigger >= 486m).
                if ($dur -ge 486) {
                    $extra = $dur - 485
                    $totalOtMin += $extra
                    $ot = "+$(Fmt-Hms $extra)"
                }
            }
        }
        
        $rowStyle = if ($isWk -and $e1 -eq "-") { "style='background:#f1f5f9;color:#94a3b8;'" } else { "" }
        $obsSpan = if ($obs) { "<span class='obs'>$obs</span>" } else { "" }
        $almoco = if ($s1 -ne "-" -or $e2 -ne "-") { "$s1 - $e2" } else { "-" }
        $tableRows += "<tr $rowStyle><td>$($curr.ToString('dd/MM/yyyy'))</td><td>$e1</td><td>$almoco</td><td>$s2</td><td>$duration</td><td>$ot</td><td>$obsSpan</td></tr>"
        $curr = $curr.AddDays(1)
    }

    $safeName = $emp.name -replace [char]225, "&aacute;" -replace [char]233, "&eacute;" -replace [char]237, "&iacute;" -replace [char]243, "&oacute;" -replace [char]250, "&uacute;" -replace [char]231, "&ccedil;" -replace [char]227, "&atilde;"
    $html += "<div class='page'><div class='header'><div class='header-info'><h1>Pontual | Gengibre</h1><p>Relat&oacute;rio de Assiduidade Mensal</p></div></div>"
    $html += "<div class='emp-box'><div><strong>Colaborador</strong><span>$safeName</span></div><div><strong>ID</strong><span>$id</span></div><div><strong>Per&iacute;odo</strong><span>26/07/2026 a 09/08/2026</span></div></div>"
    $html += "<table><thead><tr><th>Data</th><th>Entrada</th><th>Almo&ccedil;o</th><th>Sa&iacute;da</th><th>Total</th><th>Extra</th><th>Obs</th></tr></thead><tbody>$tableRows</tbody>"
    $html += "<tfoot><tr class='total-row'><td colspan='4' style='text-align:right'>TOTAL DO PER&Iacute;ODO:</td><td>$(Fmt-Hms $totalWorkMin)</td><td>$(Fmt-Hms $totalOtMin)</td><td></td></tr></tfoot></table>"
    $html += "</div>"
}

$html += "</body></html>"
$htmlPath = Join-Path $outputDir "Relatorio_Gengibre_Julho_Agosto_Records.html"
[System.IO.File]::WriteAllText($htmlPath, $html, [System.Text.Encoding]::UTF8)

Write-Host "✅ Relatório Gengibre gerado com sucesso!"
Write-Host "   -> $htmlPath"
