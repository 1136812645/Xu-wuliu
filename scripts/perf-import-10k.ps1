function Clear-ActiveVehicle($vehicleId) {
  $list = Invoke-RestMethod -Uri 'http://localhost:3000/api/waybills' -Method Get
  $active = $list.items | Where-Object {
    $_.vehicleId -eq $vehicleId -and (
      $_.status -eq 'ASSIGNED' -or $_.status -eq 'PICKED_UP' -or $_.status -eq 'IN_TRANSIT' -or $_.status -eq 'SIGNED'
    )
  }

  foreach ($w in $active) {
    if ($w.status -ne 'SIGNED' -and $w.status -ne 'POD_UPLOADED') {
      $k1 = "cleanup-sign-$($w.id)-$([guid]::NewGuid().ToString('N'))"
      try {
        Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/sign" -f $w.id) -Method Post -Headers @{ 'x-idempotency-key' = $k1 } -ContentType 'application/json' -Body '{}' | Out-Null
      } catch {}
    }

    $k2 = "cleanup-pod-$($w.id)-$([guid]::NewGuid().ToString('N'))"
    try {
      Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/upload-pod" -f $w.id) -Method Post -Headers @{ 'x-idempotency-key' = $k2 } -ContentType 'application/json' -Body '{}' | Out-Null
    } catch {}
  }
}

$vehicle = 'vehicle-1'
Clear-ActiveVehicle $vehicle

$conn = Get-NetTCPConnection -LocalPort 3000 | Select-Object -First 1
$apiPid = $conn.OwningProcess
$memBefore = (Get-Process -Id $apiPid).WorkingSet64
$sw = [System.Diagnostics.Stopwatch]::StartNew()

$created = 0
$signed = 0
$pod = 0
$failed = 0
$samples = @()

for ($i = 1; $i -le 10000; $i++) {
  $payload = @{
    shipperId = 'shipper-1'
    carrierId = 'carrier-1'
    vehicleId = $vehicle
    mileageKm = 12
    weightKg = 1000
    volumeM3 = 3
    goodsName = "bulk-$i"
    extraLoadingFee = 0
    subsidy = 0
    deduction = 0
  } | ConvertTo-Json

  $create = $null
  $ok = $false
  for ($attempt = 1; $attempt -le 3 -and -not $ok; $attempt++) {
    try {
      $ck = "perf-create-$i-$attempt"
      $create = Invoke-RestMethod -Uri 'http://localhost:3000/api/waybills' -Method Post -Headers @{ 'x-idempotency-key' = $ck } -ContentType 'application/json' -Body $payload
      $ok = $true
    } catch {
      if ($_.Exception.Message -like '*(409)*') {
        Clear-ActiveVehicle $vehicle
      }
    }
  }

  if (-not $ok) {
    $failed++
    continue
  }

  $created++

  try {
    $sid = "perf-sign-$i"
    Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/sign" -f $create.id) -Method Post -Headers @{ 'x-idempotency-key' = $sid } -ContentType 'application/json' -Body '{}' | Out-Null
    $signed++
  } catch {
    $failed++
    continue
  }

  try {
    $pidem = "perf-pod-$i"
    Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/upload-pod" -f $create.id) -Method Post -Headers @{ 'x-idempotency-key' = $pidem } -ContentType 'application/json' -Body '{}' | Out-Null
    $pod++
  } catch {
    $failed++
    continue
  }

  if ($i % 1000 -eq 0) {
    $m = (Get-Process -Id $apiPid).WorkingSet64
    $samples += [PSCustomObject]@{
      checkpoint = $i
      workingSetMB = [Math]::Round($m / 1MB, 2)
    }
  }
}

$sw.Stop()
$memAfter = (Get-Process -Id $apiPid).WorkingSet64

[PSCustomObject]@{
  total = 10000
  created = $created
  signed = $signed
  podUploaded = $pod
  failed = $failed
  durationSec = [Math]::Round($sw.Elapsed.TotalSeconds, 2)
  memBeforeMB = [Math]::Round($memBefore / 1MB, 2)
  memAfterMB = [Math]::Round($memAfter / 1MB, 2)
  memDeltaMB = [Math]::Round(($memAfter - $memBefore) / 1MB, 2)
} | ConvertTo-Json -Depth 4

$samples | Format-Table -AutoSize
