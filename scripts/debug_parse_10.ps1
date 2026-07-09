$recordsFile = "C:\Users\JD\Documents\Pontual\Relatorios\Records_AllDepts_260331_to_260430_5567 (1).xls"
$content = [System.IO.File]::ReadAllText($recordsFile, [System.Text.Encoding]::UTF8)
$cellRegex = '(?i)<td[^>]*>(.*?)<\/td>'
$matches = [regex]::Matches($content, $cellRegex)

$targetDate = "2026-04-27"
$targetId = "10"
$foundEmp = $false
$currentDate = ""

foreach ($m in $matches) {
    $raw = $m.Groups[1].Value
    $val = $raw -replace '<[^>]+>', '' -replace '&nbsp;', ''
    $val = $val.Trim()
    
    if ($val -match '^(\d+)\s*-\s*(.*)$') {
        $id = $matches[0].Groups[1].Value # Wait, matches[0] is wrong here, should be [regex]::Match
        $empM = [regex]::Match($val, '^(\d+)\s*-\s*(.*)$')
        $id = $empM.Groups[1].Value.Trim()
        if ($id -eq $targetId) { $foundEmp = $true; Write-Host "Found target employee 10" }
        else { $foundEmp = $false }
        continue
    }
    
    if ($foundEmp) {
        if ($val -match '^(\d{1,2})/(\d{1,2})/(\d{4})$') {
            $dm = [regex]::Match($val, '^(\d{1,2})/(\d{1,2})/(\d{4})$')
            $currentDate = "$($dm.Groups[3].Value)-$($dm.Groups[2].Value.PadLeft(2, '0'))-$($dm.Groups[1].Value.PadLeft(2, '0'))"
            Write-Host "Found date: $currentDate (Raw: $val)"
            continue
        }
        
        if ($currentDate -eq $targetDate) {
            Write-Host "In target date 27/04! Checking cell: '$val' (Raw: '$raw')"
        }
    }
}
