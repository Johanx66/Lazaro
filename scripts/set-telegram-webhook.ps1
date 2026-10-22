# Registra el webhook de Telegram y muestra getWebhookInfo.
# Lee las variables de la sesión; NUNCA lee .env ni imprime el token o el secreto.
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$botToken = "$env:TELEGRAM_BOT_TOKEN".Trim()
$webhookSecret = "$env:TELEGRAM_WEBHOOK_SECRET".Trim()
$publicBaseUrl = "$env:PUBLIC_BASE_URL".Trim()

$missing = @()
if (-not $botToken) { $missing += "TELEGRAM_BOT_TOKEN" }
if (-not $webhookSecret) { $missing += "TELEGRAM_WEBHOOK_SECRET" }
if (-not $publicBaseUrl) { $missing += "PUBLIC_BASE_URL" }

if ($missing.Count -gt 0) {
    throw ("Faltan variables de entorno requeridas: " + ($missing -join ", ") + ". Defínelas en esta sesión (no se leen de .env).")
}

if ($publicBaseUrl -notmatch '^https://[^\s]+$') {
    throw "PUBLIC_BASE_URL debe empezar por https:// y no contener espacios."
}

if ($webhookSecret -notmatch '^[A-Za-z0-9_-]{1,256}$') {
    throw "TELEGRAM_WEBHOOK_SECRET debe tener de 1 a 256 caracteres: letras, dígitos, '-' o '_'."
}

$url = $publicBaseUrl.TrimEnd('/') + "/webhooks/telegram"

function Get-HttpStatus($err) {
    try {
        if ($err.Exception.Response -and $err.Exception.Response.StatusCode) {
            return [int]$err.Exception.Response.StatusCode
        }
    } catch {
        return $null
    }
    return $null
}

Write-Host "Registrando webhook en $url"

$body = @{
    url = $url
    secret_token = $webhookSecret
} | ConvertTo-Json -Compress

try {
    $resp = Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/setWebhook" -Method Post -ContentType "application/json" -Body $body
} catch {
    $status = Get-HttpStatus $_
    if ($status) {
        throw "setWebhook falló (HTTP $status). Revisa TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET."
    }
    throw "setWebhook falló sin respuesta HTTP. Revisa la conectividad."
}

if (-not $resp.ok) {
    throw "setWebhook devolvió ok=false. Revisa TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET."
}
Write-Host "setWebhook: ok"

try {
    $info = Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/getWebhookInfo" -Method Get
} catch {
    $status = Get-HttpStatus $_
    if ($status) {
        throw "getWebhookInfo falló (HTTP $status)."
    }
    throw "getWebhookInfo falló sin respuesta HTTP. Revisa la conectividad."
}

if (-not $info.ok) {
    throw "getWebhookInfo devolvió ok=false."
}

Write-Host "getWebhookInfo:"
Write-Host "  url: $($info.result.url)"
Write-Host "  has_custom_certificate: $($info.result.has_custom_certificate)"
Write-Host "  pending_update_count: $($info.result.pending_update_count)"
if ($info.result.last_error_message) {
    Write-Host "  last_error_message: $($info.result.last_error_message)"
}
if ($info.result.last_error_date) {
    Write-Host "  last_error_date: $($info.result.last_error_date)"
}
Write-Host "Listo."
