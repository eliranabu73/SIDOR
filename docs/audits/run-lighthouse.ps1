$baseUrl = "http://localhost:3001"
$outDir = "C:\Users\elira\OneDrive\שולחן העבודה\sidor4S\docs\audits\lighthouse"
$chromeFlags = "--headless --no-sandbox --disable-dev-shm-usage --disable-gpu"

$routes = @(
    @{ name = "root";           path = "/" }
    @{ name = "login";          path = "/login" }
    @{ name = "onboarding";     path = "/onboarding" }
    @{ name = "onboarding-templates"; path = "/onboarding/templates" }
    @{ name = "onboarding-import";    path = "/onboarding/import" }
    @{ name = "schedule";       path = "/schedule" }
    @{ name = "employees";      path = "/employees" }
    @{ name = "swaps";          path = "/swaps" }
    @{ name = "fairness";       path = "/fairness" }
    @{ name = "settings";       path = "/settings" }
    @{ name = "e-sample";       path = "/e/sample-token-test" }
)

foreach ($route in $routes) {
    $url = "$baseUrl$($route.path)"
    $out = "$outDir\$($route.name)"
    Write-Host "Auditing $url -> $out"
    $result = npx lighthouse $url --quiet "--chrome-flags=$chromeFlags" --output=json --output=html "--output-path=$out" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  First attempt failed, retrying with throttling-method=provided..."
        $result = npx lighthouse $url --quiet "--chrome-flags=$chromeFlags" --throttling-method=provided --output=json --output=html "--output-path=$out" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  FAILED: $($route.name)"
            $result | Out-File "$out.error.txt"
        }
    }
    Write-Host "  Done."
}

Write-Host "All Lighthouse audits complete."
