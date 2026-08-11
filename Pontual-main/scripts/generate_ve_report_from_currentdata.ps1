$currentDataFile = "C:\Users\JD\Downloads\CurrentData_AllDepts_260630_to_260731_5567.xls"
$outputDir = "C:\Users\JD\Documents\Pontual\Relatorios"

Write-Host "A processar o ficheiro CurrentData para Vontade e Empenho..."

$content = [System.IO.File]::ReadAllText($currentDataFile, [System.Text.Encoding]::UTF8)
$rowMatches = [regex]::Matches($content, '(?s)<tr[^>]*>(.*?)<\/tr>')

$employees = @{}

# Parse rows
foreach ($rm in $rowMatches) {
    $rowHtml = $rm.Groups[1].Value
    $tdMatches = [regex]::Matches($rowHtml, '(?i)<td[^>]*>(.*?)<\/td>')
    
    # CurrentData has 18 columns
    if ($tdMatches.Count -lt 18) { continue }
    
    $name = ($tdMatches[0].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
    $id = ($tdMatches[1].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
    $dept = ($tdMatches[3].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
    
    if ($dept -eq "VE") {
        if (-not $employees.ContainsKey($id)) {
            $employees[$id] = @{ id = $id; name = $name; days = @{} }
        }
        
        $dateStr = ($tdMatches[4].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
        $punchIn = ($tdMatches[6].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
        $punchOut = ($tdMatches[7].Groups[1].Value -replace '<[^>]+>', '' -replace '&nbsp;', '').Trim()
        
        if ($dateStr -match '^\d{1,2}/\d{1,2}/\d{4}$') {
            # Convert to sortable date key
            $dm = [regex]::Match($dateStr, '^(\d{1,2})/(\d{1,2})/(\d{4})$')
            $dateKey = "$($dm.Groups[3].Value)-$($dm.Groups[2].Value.PadLeft(2, '0'))-$($dm.Groups[1].Value.PadLeft(2, '0'))"
            
            $employees[$id].days[$dateKey] = @{
                punchIn = if ($punchIn -match '^\d{1,2}:\d{2}$') { $punchIn } else { "" }
                punchOut = if ($punchOut -match '^\d{1,2}:\d{2}$') { $punchOut } else { "" }
            }
        }
    }
}

# -------------------------------------------------------------
# INJECT MANUAL CORRECTIONS
# -------------------------------------------------------------
Write-Host "Injecting manual correction for Duarte Pestana (6) on 30/07/2026..."
if ($employees.ContainsKey("6")) {
    if (-not $employees["6"].days.ContainsKey("2026-07-30")) {
        $employees["6"].days["2026-07-30"] = @{ punchIn = ""; punchOut = "" }
    }
    # Update Punch In to 08:30 if it's missing
    if ($employees["6"].days["2026-07-30"].punchIn -eq "") {
        $employees["6"].days["2026-07-30"].punchIn = "08:30"
    }
}
# -------------------------------------------------------------

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
       "td { padding: 8px; border: 1px solid #e2e8f0; text-align: center; } " +
       ".total-row { background: #eff6ff; font-weight: 700; color: #1e3a8a; } " +
       ".sigs { display: flex; justify-content: space-between; margin-top: 50px; } " +
       ".sig { width: 220px; text-align: center; border-top: 1px solid #1e293b; padding-top: 8px; font-weight: 600; } " +
       ".missing { color: #ef4444; font-style: italic; font-weight: 600; font-size: 10px; } " +
       "@media print { .no-print { display: none !important; } body { background: none; padding: 0; margin: 0; } .page { margin: 0; box-shadow: none; border-radius: 0; page-break-after: always; width: 210mm; height: 297mm; } } "

$html = "<html><head><style>$css</style><meta charset='UTF-8'></head><body>"
$html += "<div class='no-print' style='text-align:center;padding:20px;'><button onclick='window.print()' style='padding:12px 24px;background:#1e3a8a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;'>Gerar PDF / Imprimir</button></div>"

$startDate = Get-Date "2026-06-30"
$endDate = Get-Date "2026-07-31"

$sortedIds = $employees.Keys | Sort-Object { [int]$_ }

foreach ($id in $sortedIds) {
    $emp = $employees[$id]
    $totalWorkMin = 0; $totalOtMin = 0; $tableRows = ""
    $curr = $startDate
    while ($curr -le $endDate) {
        $key = $curr.ToString("yyyy-MM-dd")
        $isWk = ($curr.DayOfWeek -eq 'Saturday' -or $curr.DayOfWeek -eq 'Sunday')
        $entry = "-"; $exit = "-"; $duration = "-"; $ot = "-"
        
        if ($emp.days.ContainsKey($key)) {
            $d = $emp.days[$key]
            
            if ($d.punchIn -and $d.punchOut) {
                $entry = $d.punchIn
                $exit = $d.punchOut
                $dur = (Get-Total-Minutes $exit) - (Get-Total-Minutes $entry)
                
                # Auto-deduct 1h lunch if they worked more than 5 hours (300 mins)
                if ($dur -gt 300) { $dur -= 60 }
                
                $totalWorkMin += $dur; $duration = Fmt-Hms $dur
                # VE Overtime: Cap at 8h (480m), tolerance 5m (trigger >= 486m).
                if ($dur -ge 486) {
                    $extra = $dur - 485
                    $totalOtMin += $extra
                    $ot = "+$(Fmt-Hms $extra)"
                }
            } elseif ($d.punchIn) {
                $pMin = Get-Total-Minutes $d.punchIn
                if ($pMin -lt 780) {
                    $entry = $d.punchIn; $exit = "<span class='missing'>Falta Sa&iacute;da</span>"
                } else {
                    $entry = "<span class='missing'>Falta Entrada</span>"; $exit = $d.punchIn
                }
            } elseif ($d.punchOut) {
                $pMin = Get-Total-Minutes $d.punchOut
                if ($pMin -gt 780) {
                    $entry = "<span class='missing'>Falta Entrada</span>"; $exit = $d.punchOut
                } else {
                    $entry = $d.punchOut; $exit = "<span class='missing'>Falta Sa&iacute;da</span>"
                }
            }
        }
        
        $rowStyle = if ($isWk -and $entry -eq "-") { "style='background:#f1f5f9;color:#94a3b8;'" } else { "" }
        $tableRows += "<tr $rowStyle><td>$($curr.ToString('dd/MM/yyyy'))</td><td>$entry</td><td>$exit</td><td>$duration</td><td>$ot</td></tr>"
        $curr = $curr.AddDays(1)
    }

    $safeName = $emp.name -replace [char]225, "&aacute;" -replace [char]233, "&eacute;" -replace [char]237, "&iacute;" -replace [char]243, "&oacute;" -replace [char]250, "&uacute;" -replace [char]231, "&ccedil;" -replace [char]227, "&atilde;"
    $html += "<div class='page'><div class='header'><div class='header-info'><h1>Pontual | VE Vontade e Empenho</h1><p>Relat&oacute;rio de Assiduidade Mensal</p></div></div>"
    $html += "<div class='emp-box'><div><strong>Colaborador</strong><span>$safeName</span></div><div><strong>ID</strong><span>$id</span></div><div><strong>Per&iacute;odo</strong><span>30/06/2026 a 31/07/2026</span></div></div>"
    $html += "<table><thead><tr><th>Data</th><th>Entrada</th><th>Sa&iacute;da</th><th>Dura&ccedil;&atilde;o</th><th>Horas Extra</th></tr></thead><tbody>$tableRows</tbody>"
    $html += "<tfoot><tr class='total-row'><td colspan='3' style='text-align:right'>TOTAL DO PER&Iacute;ODO:</td><td>$(Fmt-Hms $totalWorkMin)</td><td>$(Fmt-Hms $totalOtMin)</td></tr></tfoot></table>"
    $html += "<div class='sigs'><div class='sig'>Assinatura do Colaborador</div><div class='sig'>Assinatura do Respons&aacute;vel</div></div></div>"
}

$html += "</body></html>"
$htmlPath = Join-Path $outputDir "Relatorio_VE_Julho_CurrentData.html"
[System.IO.File]::WriteAllText($htmlPath, $html, [System.Text.Encoding]::UTF8)

Write-Host "✅ Relatórios gerados com sucesso!"
Write-Host "   -> $htmlPath"
