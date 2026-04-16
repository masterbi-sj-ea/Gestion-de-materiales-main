
$content = Get-Content -Path .\backend\src\modules\solicitudes\solicitudes.service.ts;
$content[284] = $content[284] -replace "\\`", "`" -replace "\\\$\\{", "`${";
$content[284] = $content[284] -replace "\\\$", "$";
Set-Content -Path .\backend\src\modules\solicitudes\solicitudes.service.ts -Value $content;

