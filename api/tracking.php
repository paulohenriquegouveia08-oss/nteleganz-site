<?php
/**
 * NT Eleganz — Marketing & Tracking API
 * Gerencia configurações de Pixels (Meta, Google, TikTok) e dispara a API de Conversões da Meta (CAPI)
 */

declare(strict_types=1);

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'tracking.php') {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Cache-Control: no-cache, no-store, must-revalidate');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

const TRACKING_SETTINGS_FILE = __DIR__ . '/../data/tracking_settings.json';

function defaultTrackingSettings(): array {
    return [
        'meta_pixel_id' => '',
        'meta_pageview_pixel_id' => '',
        'meta_pageview_enabled' => true,
        'meta_pageview_on_main' => true,
        'meta_capi_token' => '',
        'meta_test_event_code' => '',
        'gtm_id' => '',
        'ga4_id' => '',
        'google_ads_conversion_id' => '',
        'google_ads_conversion_label' => '',
        'tiktok_pixel_id' => '',
        'active' => true,
        'updatedAt' => date('c')
    ];
}

function readTrackingSettings(): array {
    if (!file_exists(TRACKING_SETTINGS_FILE)) {
        $defs = defaultTrackingSettings();
        saveTrackingSettings($defs);
        return $defs;
    }
    $raw = @file_get_contents(TRACKING_SETTINGS_FILE);
    $data = $raw ? @json_decode($raw, true) : null;
    return is_array($data) ? array_merge(defaultTrackingSettings(), $data) : defaultTrackingSettings();
}

function saveTrackingSettings(array $settings): bool {
    $dir = dirname(TRACKING_SETTINGS_FILE);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $settings['updatedAt'] = date('c');
    return (bool)@file_put_contents(
        TRACKING_SETTINGS_FILE,
        json_encode($settings, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );
}

function isAdminAuthenticated(): bool {
    $token = '';

    // LiteSpeed/Apache no Hostinger as vezes NAO expoe HTTP_AUTHORIZATION em
    // $_SERVER — busca o header tambem via apache_request_headers(), igual ao
    // que api/products.php ja faz. Sem isto o Bearer token nunca chega e todo
    // POST autenticado do painel falha com 401.
    $authHeader = $_SERVER['HTTP_AUTHORIZATION']
        ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
        ?? '';
    if ($authHeader === '' && function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $key => $value) {
            if (strcasecmp($key, 'Authorization') === 0) { $authHeader = (string)$value; break; }
        }
    }

    if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
        $token = trim($matches[1]);
    } elseif (!empty($_GET['token'])) {
        $token = trim((string)$_GET['token']);
    }

    if (!$token) return false;

    $sessionFile = __DIR__ . '/../data/admin_sessions.json';
    if (!file_exists($sessionFile)) return false;

    $sessions = @json_decode(@file_get_contents($sessionFile), true);
    return is_array($sessions) && isset($sessions[$token]) && ($sessions[$token]['expires_at'] ?? 0) > time();
}

/**
 * Dispara evento oficial de Compra (Purchase) diretamente para a API de Conversões da Meta (CAPI)
 */
function sendMetaConversionsApiPurchase(array $orderData): array {
    $settings = readTrackingSettings();
    $pixelId = trim((string)($settings['meta_pixel_id'] ?? ''));
    $capiToken = trim((string)($settings['meta_capi_token'] ?? ''));

    if (empty($settings['active']) || $pixelId === '' || $capiToken === '') {
        return ['success' => false, 'skipped' => true, 'reason' => 'Pixel ou CAPI não configurados'];
    }

    $customer = is_array($orderData['customer'] ?? null) ? $orderData['customer'] : [];
    $rawName = trim((string)($customer['name'] ?? ($orderData['clientName'] ?? '')));
    $rawEmail = strtolower(trim((string)($customer['email'] ?? ($orderData['email'] ?? ''))));
    $rawPhone = preg_replace('/\D/', '', (string)($customer['phone'] ?? ($orderData['phone'] ?? '')));
    if (strlen($rawPhone) === 10 || strlen($rawPhone) === 11) {
        $rawPhone = '55' . $rawPhone;
    }

    $nameParts = explode(' ', $rawName, 2);
    $firstName = strtolower(trim($nameParts[0] ?? ''));
    $lastName = strtolower(trim($nameParts[1] ?? ''));

    $addr = is_array($customer['address'] ?? null) ? $customer['address'] : [];
    $rawCep = preg_replace('/\D/', '', (string)($addr['cep'] ?? ''));
    $rawCity = strtolower(trim((string)($addr['city'] ?? '')));
    $rawState = strtolower(trim((string)($addr['state'] ?? '')));

    // Dados de correspondência do usuário (hasheados com SHA-256 conforme padrão da Meta)
    $userData = [];
    if ($rawEmail !== '') $userData['em'] = [hash('sha256', $rawEmail)];
    if ($rawPhone !== '') $userData['ph'] = [hash('sha256', $rawPhone)];
    if ($firstName !== '') $userData['fn'] = [hash('sha256', $firstName)];
    if ($lastName !== '') $userData['ln'] = [hash('sha256', $lastName)];
    if ($rawCep !== '') $userData['zp'] = [hash('sha256', $rawCep)];
    if ($rawCity !== '') $userData['ct'] = [hash('sha256', $rawCity)];
    if ($rawState !== '') $userData['st'] = [hash('sha256', substr($rawState, 0, 2))];
    $userData['country'] = [hash('sha256', 'br')];

    // IP e User Agent
    $clientIp = $orderData['clientIp'] ?? ($_SERVER['REMOTE_ADDR'] ?? '');
    $clientUa = $orderData['userAgent'] ?? ($_SERVER['HTTP_USER_AGENT'] ?? '');
    if ($clientIp !== '') $userData['client_ip_address'] = $clientIp;
    if ($clientUa !== '') $userData['client_user_agent'] = $clientUa;

    // Click ID (fbc) e Browser ID (fbp) se capturados nas UTMs
    $tracking = is_array($orderData['tracking'] ?? null) ? $orderData['tracking'] : [];
    if (!empty($tracking['fbclid'])) {
        $userData['fbc'] = 'fb.1.' . time() . '.' . $tracking['fbclid'];
    } elseif (!empty($tracking['fbc'])) {
        $userData['fbc'] = $tracking['fbc'];
    }
    if (!empty($tracking['fbp'])) {
        $userData['fbp'] = $tracking['fbp'];
    }

    // Código limpo do pedido para deduplicação perfeita com o evento disparado no navegador
    $orderCode = strtoupper(ltrim((string)($orderData['code'] ?? ($orderData['id'] ?? uniqid('NTE-'))), '#'));
    $eventId = 'order_' . $orderCode;

    // Normaliza valor total numérico
    $rawVal = (string)($orderData['value'] ?? '0');
    $cleanVal = preg_replace('/[^\d,.]/', '', $rawVal);
    if (strpos($cleanVal, ',') !== false) {
        $cleanVal = str_replace('.', '', $cleanVal);
        $cleanVal = str_replace(',', '.', $cleanVal);
    }
    $totalFloat = (float)$cleanVal;

    // Conteúdos / Itens
    $items = is_array($orderData['items'] ?? null) ? $orderData['items'] : [];
    $contents = [];
    $contentIds = [];
    foreach ($items as $it) {
        $id = (string)($it['id'] ?? $it['slug'] ?? 'prod');
        $qty = max(1, (int)($it['qty'] ?? 1));
        $itemPrice = (float)str_replace(',', '.', preg_replace('/[^\d,.]/', '', (string)($it['price'] ?? 0)));
        $contents[] = [
            'id' => $id,
            'quantity' => $qty,
            'item_price' => $itemPrice
        ];
        $contentIds[] = $id;
    }

    $eventPayload = [
        'event_name' => 'Purchase',
        'event_time' => time(),
        'event_id' => $eventId,
        'event_source_url' => "https://nteleganz.com.br/pedido/?code={$orderCode}",
        'action_source' => 'website',
        'user_data' => $userData,
        'custom_data' => [
            'currency' => 'BRL',
            'value' => $totalFloat,
            'order_id' => $orderCode,
            'content_type' => 'product',
            'contents' => $contents,
            'content_ids' => $contentIds,
            'num_items' => count($contents)
        ]
    ];

    $metaPayload = [
        'data' => [$eventPayload]
    ];

    if (!empty($settings['meta_test_event_code'])) {
        $metaPayload['test_event_code'] = trim((string)$settings['meta_test_event_code']);
    }

    $url = "https://graph.facebook.com/v19.0/{$pixelId}/events?access_token=" . urlencode($capiToken);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($metaPayload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json']
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $resDecoded = $response ? json_decode($response, true) : null;
    $success = ($httpCode >= 200 && $httpCode < 300) && (!isset($resDecoded['error']));

    return [
        'success' => $success,
        'http_code' => $httpCode,
        'response' => $resDecoded,
        'event_id' => $eventId
    ];
}

// ── Roteador da API (executado apenas se chamado diretamente via HTTP) ──
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'tracking.php') {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        $settings = readTrackingSettings();
        $isAdmin = isAdminAuthenticated();

        if ($isAdmin) {
            echo json_encode(['success' => true, 'settings' => $settings]);
        } else {
            // Retorna apenas dados públicos seguros para o storefront
            echo json_encode([
                'success' => true,
                'settings' => [
                    'meta_pixel_id' => $settings['meta_pixel_id'] ?? '',
                    'meta_pageview_pixel_id' => $settings['meta_pageview_pixel_id'] ?? '',
                    'meta_pageview_enabled' => isset($settings['meta_pageview_enabled']) ? (bool)$settings['meta_pageview_enabled'] : true,
                    'meta_pageview_on_main' => isset($settings['meta_pageview_on_main']) ? (bool)$settings['meta_pageview_on_main'] : true,
                    'gtm_id' => $settings['gtm_id'] ?? '',
                    'ga4_id' => $settings['ga4_id'] ?? '',
                    'google_ads_conversion_id' => $settings['google_ads_conversion_id'] ?? '',
                    'google_ads_conversion_label' => $settings['google_ads_conversion_label'] ?? '',
                    'tiktok_pixel_id' => $settings['tiktok_pixel_id'] ?? '',
                    'active' => !empty($settings['active'])
                ]
            ]);
        }
        exit;
    }

    if ($method === 'POST') {
        // Toda escrita (salvar settings e disparo de teste CAPI) exige
        // admin autenticado — o painel envia o Bearer token da sessao.
        if (!isAdminAuthenticated()) {
            http_response_code(401);
            echo json_encode(['error' => 'Não autorizado. Faça login como administrador.']);
            exit;
        }

        $raw = file_get_contents('php://input');
        $input = $raw ? json_decode($raw, true) : null;

        if (!is_array($input)) {
            http_response_code(400);
            echo json_encode(['error' => 'Dados inválidos. Envie corpo JSON.']);
            exit;
        }

        // Rota de teste CAPI em tempo real acionada pelo admin
        if (isset($_GET['test']) && $_GET['test'] === 'meta') {
            $testOrder = [
                'code' => '#TEST-' . rand(1000, 9999),
                'value' => 'R$ 489,00',
                'clientName' => $input['clientName'] ?? 'Gestor de Tráfego Teste',
                'email' => $input['email'] ?? 'teste@nteleganz.com.br',
                'phone' => $input['phone'] ?? '11999998888',
                'customer' => [
                    'name' => $input['clientName'] ?? 'Gestor de Tráfego Teste',
                    'email' => $input['email'] ?? 'teste@nteleganz.com.br',
                    'phone' => $input['phone'] ?? '11999998888',
                    'address' => [
                        'cep' => '01001000',
                        'city' => 'São Paulo',
                        'state' => 'SP'
                    ]
                ],
                'items' => [
                    [
                        'id' => 'prod_teste_capi',
                        'name' => 'Peça Teste CAPI',
                        'price' => '489.00',
                        'qty' => 1
                    ]
                ]
            ];
            $result = sendMetaConversionsApiPurchase($testOrder);
            echo json_encode(['success' => true, 'capi_result' => $result]);
            exit;
        }

        $current = readTrackingSettings();

        $sanitized = [
            'meta_pixel_id' => trim((string)($input['meta_pixel_id'] ?? $current['meta_pixel_id'])),
            'meta_pageview_pixel_id' => trim((string)($input['meta_pageview_pixel_id'] ?? ($current['meta_pageview_pixel_id'] ?? ''))),
            'meta_pageview_enabled' => isset($input['meta_pageview_enabled']) ? (bool)$input['meta_pageview_enabled'] : (bool)($current['meta_pageview_enabled'] ?? true),
            'meta_pageview_on_main' => isset($input['meta_pageview_on_main']) ? (bool)$input['meta_pageview_on_main'] : (bool)($current['meta_pageview_on_main'] ?? true),
            'meta_capi_token' => trim((string)($input['meta_capi_token'] ?? $current['meta_capi_token'])),
            'meta_test_event_code' => trim((string)($input['meta_test_event_code'] ?? $current['meta_test_event_code'])),
            'gtm_id' => trim((string)($input['gtm_id'] ?? $current['gtm_id'])),
            'ga4_id' => trim((string)($input['ga4_id'] ?? $current['ga4_id'])),
            'google_ads_conversion_id' => trim((string)($input['google_ads_conversion_id'] ?? $current['google_ads_conversion_id'])),
            'google_ads_conversion_label' => trim((string)($input['google_ads_conversion_label'] ?? $current['google_ads_conversion_label'])),
            'tiktok_pixel_id' => trim((string)($input['tiktok_pixel_id'] ?? $current['tiktok_pixel_id'])),
            'active' => isset($input['active']) ? (bool)$input['active'] : true,
        ];

        if (saveTrackingSettings($sanitized)) {
            echo json_encode(['success' => true, 'settings' => $sanitized]);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Não foi possível salvar as configurações de rastreamento']);
        }
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido']);
}
