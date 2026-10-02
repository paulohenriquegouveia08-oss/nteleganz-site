<?php
/**
 * NT Eleganz - Sincronizador Automático de Imagens
 * Baixa fotos da VPS para a pasta local da Hostinger se estiverem ausentes.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');

const VPS_UPLOADS_URL = 'https://137-131-233-254.sslip.io/nteleganz/uploads/';
const VPS_API_PRODUCTS = 'https://137-131-233-254.sslip.io/nteleganz/api/products';
const LOCAL_IMG_DIR = __DIR__ . '/../assets/images/products/';

if (!is_dir(LOCAL_IMG_DIR)) {
    @mkdir(LOCAL_IMG_DIR, 0755, true);
}

// 1. Obter lista de produtos da VPS ou arquivo local
$products = [];
$ch = curl_init(VPS_API_PRODUCTS);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 5,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => 0,
]);
$raw = curl_exec($ch);
curl_close($ch);

if ($raw) {
    $data = json_decode($raw, true);
    if (!empty($data['products'])) {
        $products = $data['products'];
    }
}

if (empty($products)) {
    $localFile = __DIR__ . '/../data/products.json';
    if (file_exists($localFile)) {
        $localData = json_decode(file_get_contents($localFile), true);
        $products = $localData['products'] ?? [];
    }
}

// 2. Extrair todas as fotos necessárias
$filenames = [];
foreach ($products as $p) {
    $all = [];
    if (!empty($p['image'])) $all[] = $p['image'];
    if (!empty($p['images']) && is_array($p['images'])) {
        foreach ($p['images'] as $img) {
            if (!empty($img)) $all[] = $img;
        }
    }
    foreach ($all as $u) {
        $fn = basename(parse_url($u, PHP_URL_PATH));
        if ($fn && preg_match('/^[a-zA-Z0-9_-]+\.webp$/', $fn)) {
            $filenames[$fn] = true;
        }
    }
}

$total = count($filenames);
$synced = 0;
$alreadyExists = 0;
$failed = 0;
$details = [];

foreach (array_keys($filenames) as $filename) {
    $targetPath = LOCAL_IMG_DIR . $filename;
    if (file_exists($targetPath) && filesize($targetPath) > 0) {
        $alreadyExists++;
        continue;
    }

    // Baixa da VPS
    $vpsUrl = VPS_UPLOADS_URL . $filename;
    $vch = curl_init($vpsUrl);
    curl_setopt_array($vch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 6,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);
    $imgData = curl_exec($vch);
    $httpCode = curl_getinfo($vch, CURLINFO_HTTP_CODE);
    curl_close($vch);

    if ($imgData !== false && $httpCode === 200 && strlen($imgData) > 500) {
        @file_put_contents($targetPath, $imgData);
        $synced++;
        $details[] = ['file' => $filename, 'status' => 'synced', 'size' => strlen($imgData)];
    } else {
        $failed++;
        $details[] = ['file' => $filename, 'status' => 'not_on_vps_either', 'http' => $httpCode];
    }
}

echo json_encode([
    'ok' => true,
    'total_unique_images' => $total,
    'synced_from_vps' => $synced,
    'already_existed' => $alreadyExists,
    'not_found_on_vps' => $failed,
    'details' => $details
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
