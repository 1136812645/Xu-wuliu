function Get-VehicleProfile($vehicleId) {
  $bootstrap = Invoke-RestMethod -Uri 'http://localhost:3000/api/bootstrap' -Method Get
  return $bootstrap.references.vehicles | Where-Object { $_.id -eq $vehicleId } | Select-Object -First 1
}

function Get-LatestWaybillSet($count) {
  $list = Invoke-RestMethod -Uri 'http://localhost:3000/api/waybills' -Method Get
  return $list.items | Select-Object -First $count
}

function Clear-ActiveVehicle($vehicleId) {
  $list = Invoke-RestMethod -Uri 'http://localhost:3000/api/waybills' -Method Get
  $active = $list.items | Where-Object {
    $_.vehicleId -eq $vehicleId -and (
      $_.status -eq 'ASSIGNED' -or $_.status -eq 'PICKED_UP' -or $_.status -eq 'IN_TRANSIT' -or $_.status -eq 'SIGNED'
    )
  }

  foreach ($w in $active) {
    try {
      if ($w.status -ne 'SIGNED' -and $w.status -ne 'POD_UPLOADED') {
        $k1 = "clear-s-$([guid]::NewGuid().ToString('N'))"
        Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/sign" -f $w.id) -Method Post -Headers @{ 'x-idempotency-key' = $k1 } -ContentType 'application/json' -Body '{}' | Out-Null
      }
      $k2 = "clear-p-$([guid]::NewGuid().ToString('N'))"
      Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/upload-pod" -f $w.id) -Method Post -Headers @{ 'x-idempotency-key' = $k2 } -ContentType 'application/json' -Body '{}' | Out-Null
    } catch {}
  }
}

$vehicleId = 'vehicle-1'
$vehicle = Get-VehicleProfile $vehicleId
if (-not $vehicle) {
  Write-Output 'vehicle-not-found'
  exit 1
}

$cases = @(
  [PSCustomObject]@{
    name = 'overweight-only'
    payload = @{
      shipperId = 'shipper-1'
      carrierId = 'carrier-1'
      vehicleId = $vehicleId
      mileageKm = 80
      weightKg = [double]$vehicle.maxWeightKg + 2500
      volumeM3 = [double]$vehicle.maxVolumeM3 - 1
      goodsName = 'capacity-overweight'
      extraLoadingFee = 0
      subsidy = 0
      deduction = 0
    }
  }
  [PSCustomObject]@{
    name = 'overvolume-only'
    payload = @{
      shipperId = 'shipper-1'
      carrierId = 'carrier-1'
      vehicleId = $vehicleId
      mileageKm = 80
      weightKg = [double]$vehicle.maxWeightKg - 100
      volumeM3 = [double]$vehicle.maxVolumeM3 + 12
      goodsName = 'capacity-overvolume'
      extraLoadingFee = 0
      subsidy = 0
      deduction = 0
    }
  }
  [PSCustomObject]@{
    name = 'both-exceeded'
    payload = @{
      shipperId = 'shipper-1'
      carrierId = 'carrier-1'
      vehicleId = $vehicleId
      mileageKm = 80
      weightKg = [double]$vehicle.maxWeightKg + 3000
      volumeM3 = [double]$vehicle.maxVolumeM3 + 15
      goodsName = 'capacity-both'
      extraLoadingFee = 0
      subsidy = 0
      deduction = 0
    }
  }
)

$results = @()

foreach ($c in $cases) {
  Clear-ActiveVehicle $vehicleId

  $quoteBody = $c.payload | ConvertTo-Json
  $quoteResult = $null
  $quoteBlocked = $false
  $quoteError = ''

  try {
    $quoteResult = Invoke-RestMethod -Uri 'http://localhost:3000/api/waybills/quote' -Method Post -ContentType 'application/json' -Body $quoteBody
  } catch {
    $quoteBlocked = $true
    if ($_.Exception.Response) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $quoteError = $reader.ReadToEnd()
      if ($quoteError.StartsWith('{')) {
        try {
          $quoteError = (ConvertFrom-Json $quoteError).message
        } catch {}
      }
    } else {
      $quoteError = $_.Exception.Message
    }
  }

  $createKey = "cap-$($c.name)-$([guid]::NewGuid().ToString('N'))"
  $createResult = $null
  $createStatus = 201
  try {
    $createResult = Invoke-RestMethod -Uri 'http://localhost:3000/api/waybills' -Method Post -Headers @{ 'x-idempotency-key' = $createKey } -ContentType 'application/json' -Body $quoteBody
  } catch {
    $createStatus = [int]$_.Exception.Response.StatusCode
  }

  $splitApplied = [bool]$createResult.splitApplied
  $splitCount = 0
  $childrenWithinLimit = $true
  $maxChildWeight = 0
  $maxChildVolume = 0

  if ($splitApplied) {
    $splitCount = [int]$createResult.splitCount
    foreach ($item in $createResult.items) {
      if ([double]$item.weightKg -gt [double]$vehicle.maxWeightKg -or [double]$item.volumeM3 -gt [double]$vehicle.maxVolumeM3) {
        $childrenWithinLimit = $false
      }
      if ([double]$item.weightKg -gt $maxChildWeight) {
        $maxChildWeight = [double]$item.weightKg
      }
      if ([double]$item.volumeM3 -gt $maxChildVolume) {
        $maxChildVolume = [double]$item.volumeM3
      }
    }
  }

  $results += [PSCustomObject]@{
    case = $c.name
    overweightInput = [Math]::Round(([double]$c.payload.weightKg - [double]$vehicle.maxWeightKg), 2)
    overvolumeInput = [Math]::Round(([double]$c.payload.volumeM3 - [double]$vehicle.maxVolumeM3), 2)
    quoteBlocked = $quoteBlocked
    quoteError = $quoteError
    quoteErrorContainsOverweight = ($quoteError -match 'overweightKg')
    quoteErrorContainsOverVolume = ($quoteError -match 'overVolumeM3')
    createStatus = $createStatus
    splitApplied = $splitApplied
    splitCount = $splitCount
    promptOverweight = $createResult.overweightKg
    promptOverVolume = $createResult.overVolumeM3
    childrenWithinLimit = $childrenWithinLimit
    maxChildWeight = $maxChildWeight
    maxChildVolume = $maxChildVolume
  }
}

$results | ConvertTo-Json -Depth 6
