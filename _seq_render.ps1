Set-Location "d:\du_an\Auto-Create-Video"

function Trigger-And-Wait($jobDir) {
  # trigger with up to 3 retries (gh sometimes returns a transient 401)
  $ok = $false
  for ($i = 0; $i -lt 3 -and -not $ok; $i++) {
    gh workflow run render.yml -f job_dir=$jobDir 2>$null | Out-Null
    Start-Sleep -Seconds 10
    $list = gh run list --workflow=render.yml --limit 1 --json databaseId,status 2>$null | ConvertFrom-Json
    if ($list -and $list[0].status -ne "completed") { $ok = $true; $id = $list[0].databaseId }
    else { Start-Sleep -Seconds 6 }
  }
  if (-not $ok) { return "$jobDir|TRIGGER_FAILED|" }
  do {
    Start-Sleep -Seconds 30
    $s = gh run view $id --json status,conclusion 2>$null | ConvertFrom-Json
  } while (-not $s -or $s.status -ne "completed")
  return "$jobDir|$id|$($s.conclusion)"
}

$r1 = Trigger-And-Wait "jobs/mmo-6-hinh-thuc"
Start-Sleep -Seconds 8
$r2 = Trigger-And-Wait "jobs/youtube-faceless-tach-kenh"
"RESULT1=$r1"
"RESULT2=$r2"
