function Get-AdminToken() {
  return (
    Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/dev-login' -Method Post -ContentType 'application/json' -Body (
      @{ email = 'admin@example.com'; name = 'Admin User'; role = 'ADMIN' } | ConvertTo-Json
    )
  ).token
}

function Get-CarrierToken() {
  return (
    Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/dev-login' -Method Post -ContentType 'application/json' -Body (
      @{ email = 'carrier@example.com'; name = 'Carrier User'; role = 'CARRIER' } | ConvertTo-Json
    )
  ).token
}

function Complete-Waybill($waybillId, $adminToken, $carrierToken) {
  try {
    $k1 = "bdr-sign-$([guid]::NewGuid().ToString('N'))"
    Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/sign" -f $waybillId) -Method Post -Headers @{ Authorization = "Bearer $adminToken"; 'x-idempotency-key' = $k1 } -ContentType 'application/json' -Body '{}' | Out-Null
  } catch {}

  try {
    $k2 = "bdr-pod-$([guid]::NewGuid().ToString('N'))"
    Invoke-RestMethod -Uri ("http://localhost:3000/api/waybills/{0}/upload-pod" -f $waybillId) -Method Post -Headers @{ Authorization = "Bearer $carrierToken"; 'x-idempotency-key' = $k2 } -ContentType 'application/json' -Body '{}' | Out-Null
  } catch {}
}

function CleanupVehicle($vehicleId, $adminToken, $carrierToken) {
  $list = Invoke-RestMethod -Uri 'http://localhost:3000/api/waybills' -Method Get -Headers @{ Authorization = "Bearer $adminToken" }
  $active = $list.items | Where-Object {
    $_.vehicleId -eq $vehicleId -and (
      $_.status -eq 'ASSIGNED' -or $_.status -eq 'PICKED_UP' -or $_.status -eq 'IN_TRANSIT' -or $_.status -eq 'SIGNED'
    )
  }
  foreach ($w in $active) {
    Complete-Waybill $w.id $adminToken $carrierToken
  }
}

$vehicle = 'vehicle-2'
$adminToken = Get-AdminToken
$carrierToken = Get-CarrierToken
CleanupVehicle $vehicle $adminToken $carrierToken

$cases = @(
  [PSCustomObject]@{
    name = 'zero-mileage'
    payload = @{
      shipperId = 'shipper-2'
      carrierId = 'carrier-2'
      vehicleId = 'vehicle-2'
      mileageKm = 0
      weightKg = 1000
      volumeM3 = 2
      goodsName = 'boundary-zero-mileage'
      extraLoadingFee = 0
      subsidy = 0
      deduction = 0
    }
  },
  [PSCustomObject]@{
    name = 'zero-freight'
    payload = @{
      shipperId = 'shipper-2'
      carrierId = 'carrier-2'
      vehicleId = 'vehicle-2'
      mileageKm = 0
      weightKg = 1000
      volumeM3 = 2
      goodsName = 'boundary-zero-freight'
      extraLoadingFee = -120
      subsidy = 0
      deduction = 0
    }
  },
  [PSCustomObject]@{
    name = 'negative-subsidy'
    payload = @{
      shipperId = 'shipper-2'
      carrierId = 'carrier-2'
      vehicleId = 'vehicle-2'
      mileageKm = 0
      weightKg = 1000
      volumeM3 = 2
      goodsName = 'boundary-negative-subsidy'
      extraLoadingFee = 0
      subsidy = -20
      deduction = 0
    }
  },
  [PSCustomObject]@{
    name = 'empty-waybill'
    payload = @{
      shipperId = 'shipper-2'
      carrierId = 'carrier-2'
      vehicleId = 'vehicle-2'
      mileageKm = 0
      weightKg = 1000
      volumeM3 = 2
      goodsName = '   '
      extraLoadingFee = 0
      subsidy = 0
      deduction = 0
    }
  }
)

$results = @()

foreach ($c in $cases) {
  CleanupVehicle $vehicle $adminToken $carrierToken
  $body = $c.payload | ConvertTo-Json

  $quoteStatus = 0
  $quoteBody = $null
  try {
    $q = Invoke-WebRequest -Uri 'http://localhost:3000/api/waybills/quote' -Method Post -ContentType 'application/json' -Body $body
    $quoteStatus = [int]$q.StatusCode
    $quoteBody = $q.Content | ConvertFrom-Json
  } catch {
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      try {
        $quoteBody = ConvertFrom-Json $_.ErrorDetails.Message
      } catch {
        $quoteBody = @{ message = $_.ErrorDetails.Message }
      }
    }
    if ($_.Exception.Response) {
      $quoteStatus = [int]$_.Exception.Response.StatusCode
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $raw = $reader.ReadToEnd()
      if (-not $quoteBody) {
        if ($raw.StartsWith('{')) {
          try { $quoteBody = $raw | ConvertFrom-Json } catch { $quoteBody = @{ message = $raw } }
        } else {
          $quoteBody = @{ message = $raw }
        }
      }
    }
  }

  $createStatus = 0
  $createBody = $null
  try {
    $k = "bdr-create-$($c.name)-$([guid]::NewGuid().ToString('N'))"
    $cr = Invoke-WebRequest -Uri 'http://localhost:3000/api/waybills' -Method Post -Headers @{ Authorization = "Bearer $adminToken"; 'x-idempotency-key' = $k } -ContentType 'application/json' -Body $body
    $createStatus = [int]$cr.StatusCode
    $createBody = $cr.Content | ConvertFrom-Json
  } catch {
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      try {
        $createBody = ConvertFrom-Json $_.ErrorDetails.Message
      } catch {
        $createBody = @{ message = $_.ErrorDetails.Message }
      }
    }
    if ($_.Exception.Response) {
      $createStatus = [int]$_.Exception.Response.StatusCode
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $raw = $reader.ReadToEnd()
      if (-not $createBody) {
        if ($raw.StartsWith('{')) {
          try { $createBody = $raw | ConvertFrom-Json } catch { $createBody = @{ message = $raw } }
        } else {
          $createBody = @{ message = $raw }
        }
      }
    }
  }

  if ($createStatus -eq 201 -and $createBody.id) {
    Complete-Waybill $createBody.id $adminToken $carrierToken
  }

  $lineHaul = $null
  $loading = $null
  $insurance = $null
  $subsidy = $null
  $deduction = $null
  $total = $null

  if ($createBody -and $createBody.fees) {
    $lineHaul = ($createBody.fees | Where-Object { $_.type -eq 'LINE_HAUL' } | Select-Object -First 1).amount
    $loading = ($createBody.fees | Where-Object { $_.type -eq 'LOADING' } | Select-Object -First 1).amount
    $insurance = ($createBody.fees | Where-Object { $_.type -eq 'INSURANCE' } | Select-Object -First 1).amount
    $subsidy = ($createBody.fees | Where-Object { $_.type -eq 'SUBSIDY' } | Select-Object -First 1).amount
    $deduction = ($createBody.fees | Where-Object { $_.type -eq 'DEDUCTION' } | Select-Object -First 1).amount
    $total = $createBody.totalAmount
  }

  $results += [PSCustomObject]@{
    case = $c.name
    quoteStatus = $quoteStatus
    quoteMessage = $quoteBody.message
    createStatus = $createStatus
    createMessage = $createBody.message
    lineHaul = $lineHaul
    loading = $loading
    insurance = $insurance
    subsidy = $subsidy
    deduction = $deduction
    totalAmount = $total
  }
}

$results | ConvertTo-Json -Depth 6
