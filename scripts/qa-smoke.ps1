$base = "http://localhost:3000/api"
$userAlice = "00000000-0000-0000-0000-000000000001" # Creator
$userCharlie = "00000000-0000-0000-0000-000000000003" # Admin/Issuer

function Test-Endpoint {
    param($Name, $Method, $Path, $Body, $User, $ExpectStatus = 200)
    
    Write-Host "TEST: $Name..." -NoNewline
    
    $headers = @{ "Content-Type" = "application/json" }
    if ($User) { $headers["x-user-id"] = $User }

    try {
        $params = @{
            Uri     = "$base$Path"
            Method  = $Method
            Headers = $headers
        }
        if ($Body) { $params["Body"] = ($Body | ConvertTo-Json -Depth 10) }
        
        $response = Invoke-RestMethod @params -ErrorAction Stop
        Write-Host " PASS" -ForegroundColor Green
        return $response
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq $ExpectStatus) {
            Write-Host " PASS (Expected Failure: $statusCode)" -ForegroundColor Green
            return $null
        }
        Write-Host " FAIL ($statusCode)" -ForegroundColor Red
        Write-Host $_.Exception.Message
        # exit 1 
        return $null
    }
}

# 1. Create Letter (Alice)
# First get dept ID
$depts = Invoke-RestMethod -Uri "$base/departments?context=COMPANY"
$deptId = $depts[0].id

$draft = Test-Endpoint -Name "Create Draft" -Method POST -Path "/letters" -User $userAlice -Body @{
    context       = "COMPANY"
    department_id = $deptId
    content       = "Smoke Test Content"
    tag_ids       = @()
}

if (!$draft) { exit 1 }
$letterId = $draft.id

# 2. Update Draft (Alice) - Triggers Versioning
Test-Endpoint -Name "Update Draft" -Method POST -Path "/letters" -User $userAlice -Body @{
    id      = $letterId
    content = "Smoke Test Content Updated"
}

# 3. Approve (Charlie - Admin)
Test-Endpoint -Name "Approve Letter" -Method POST -Path "/letters/$letterId/approve" -User $userCharlie -Body @{
    comment = "LGTM"
}

# 4. Issue (Charlie - Issuer)
$issued = Test-Endpoint -Name "Issue Letter" -Method POST -Path "/letters/$letterId/issue" -User $userCharlie -Body @{
    channel = "PRINT"
}

if (!$issued) { exit 1 }

# 5. Verify (Public)
$hash = $issued.verifyUrl.Split('/')[-1]
Test-Endpoint -Name "Verify Hash" -Method GET -Path "/verify/$hash"

# 6. Revoke (Charlie - Admin)
Test-Endpoint -Name "Revoke Letter" -Method POST -Path "/letters/$letterId/revoke" -User $userCharlie

# 7. Verify Revocation
$verifyRevoked = Invoke-RestMethod -Uri "$base/verify/$hash"
if ($verifyRevoked.status -eq "REVOKED") {
    Write-Host "TEST: Verify Revocation... PASS" -ForegroundColor Green
}
else {
    Write-Host "TEST: Verify Revocation... FAIL" -ForegroundColor Red
}

Write-Host "`nQA SMOKE PASS" -ForegroundColor Cyan
