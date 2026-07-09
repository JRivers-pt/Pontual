$recordsFile = "C:\Users\JD\Documents\Pontual\Relatorios\Records_AllDepts_260331_to_260430_5567 (1).xls"
$content = [System.IO.File]::ReadAllText($recordsFile, [System.Text.Encoding]::UTF8)
$idx = $content.IndexOf("07/04/2026")
if ($idx -ge 0) {
    $sub = $content.Substring($idx, 2000)
    Write-Host "SUBSTRING START"
    Write-Host $sub
    Write-Host "SUBSTRING END"
} else {
    Write-Host "DATE NOT FOUND"
}
