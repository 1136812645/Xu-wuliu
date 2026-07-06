$list = Invoke-RestMethod -Uri 'http://localhost:3000/api/waybills' -Method Get
$target = $list.items | Where-Object { $_.status -eq 'ASSIGNED' } | Select-Object -First 1

if (-not $target) {
  Write-Output 'no-assigned-waybill'
  exit 0
}

$signKey1 = "idem-sign-1-$([guid]::NewGuid().ToString('N'))"
$firstSign = Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/sign" -f $target.id) -Method Post -Headers @{ 'x-idempotency-key' = $signKey1 } -ContentType 'application/json' -Body '{}'

$signKey2 = "idem-sign-2-$([guid]::NewGuid().ToString('N'))"
$secondSign = Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/sign" -f $target.id) -Method Post -Headers @{ 'x-idempotency-key' = $signKey2 } -ContentType 'application/json' -Body '{}'

$sameKeySign = Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/sign" -f $target.id) -Method Post -Headers @{ 'x-idempotency-key' = $signKey2 } -ContentType 'application/json' -Body '{}'

$podKey1 = "idem-pod-1-$([guid]::NewGuid().ToString('N'))"
$firstPod = Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/upload-pod" -f $target.id) -Method Post -Headers @{ 'x-idempotency-key' = $podKey1 } -ContentType 'application/json' -Body '{}'

$podKey2 = "idem-pod-2-$([guid]::NewGuid().ToString('N'))"
$secondPod = Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/upload-pod" -f $target.id) -Method Post -Headers @{ 'x-idempotency-key' = $podKey2 } -ContentType 'application/json' -Body '{}'

$sameKeyPod = Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/upload-pod" -f $target.id) -Method Post -Headers @{ 'x-idempotency-key' = $podKey2 } -ContentType 'application/json' -Body '{}'

$result = [PSCustomObject]@{
  waybillId = $target.id
  sign = [PSCustomObject]@{
    firstStatus = $firstSign.status
    firstSignedAt = $firstSign.signedAt
    duplicateBlocked = $secondSign.idempotentBlocked
    duplicateReason = $secondSign.reason
    duplicateMessage = $secondSign.message
    duplicateSignedAt = $secondSign.data.signedAt
    signedAtUnchanged = ($secondSign.data.signedAt -eq $firstSign.signedAt)
    sameKeyBlocked = $sameKeySign.idempotentBlocked
    sameKeyReason = $sameKeySign.reason
  }
  pod = [PSCustomObject]@{
    firstStatus = $firstPod.status
    firstPodUploadedAt = $firstPod.podUploadedAt
    duplicateBlocked = $secondPod.idempotentBlocked
    duplicateReason = $secondPod.reason
    duplicateMessage = $secondPod.message
    duplicatePodUploadedAt = $secondPod.data.podUploadedAt
    podUploadedAtUnchanged = ($secondPod.data.podUploadedAt -eq $firstPod.podUploadedAt)
    sameKeyBlocked = $sameKeyPod.idempotentBlocked
    sameKeyReason = $sameKeyPod.reason
  }
}

$result | ConvertTo-Json -Depth 8
