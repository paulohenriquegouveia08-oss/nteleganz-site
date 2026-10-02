<?php
// NT ELEGANZ — Clean Image Proxy
// Permite acessar a foto da peça por slug limpo: /foto/?p=camiseta-polo-bear-rl-grey-g
$productQuery = isset($_GET['p']) ? trim((string)$_GET['p']) : (isset($_GET['slug']) ? trim((string)$_GET['slug']) : (isset($_GET['id']) ? trim((string)$_GET['id']) : ''));

if ($productQuery === '') {
    http_response_code(404);
    exit('Imagem não encontrada');
}

$dataPath = __DIR__ . '/../data/products.json';
if (!file_exists($dataPath)) {
    http_response_code(404);
    exit('Catálogo não encontrado');
}

$json = @file_get_contents($dataPath);
$data = @json_decode($json, true);
$products = (is_array($data) && isset($data['products']) && is_array($data['products'])) ? $data['products'] : [];

function slugify(string $text): string {
    $text = preg_replace('~[^\pL\d]+~u', '-', $text);
    $text = iconv('utf-8', 'us-ascii//TRANSLIT', $text);
    $text = preg_replace('~[^-\w]+~', '', $text);
    $text = trim($text, '-');
    $text = preg_replace('~-+~', '-', $text);
    return strtolower($text);
}

function getProductCleanSlug(array $p, array $all): string {
    $base = !empty($p['slug']) ? slugify((string)$p['slug']) : slugify((string)($p['name'] ?? ''));
    if (empty($all) || count($all) <= 1) return $base;

    $duplicates = 0;
    foreach ($all as $item) {
        $itemBase = !empty($item['slug']) ? slugify((string)$item['slug']) : slugify((string)($item['name'] ?? ''));
        if ($itemBase === $base) $duplicates++;
    }
    if ($duplicates <= 1) return $base;

    $color = (!empty($p['colors']) && is_array($p['colors']) && !empty($p['colors'][0])) ? slugify((string)$p['colors'][0]) : '';
    $size = (!empty($p['sizes']) && is_array($p['sizes']) && !empty($p['sizes'][0])) ? slugify((string)$p['sizes'][0]) : '';

    $candidate = $base;
    if ($color !== '' && $size !== '') $candidate = "{$base}-{$color}-{$size}";
    elseif ($color !== '') $candidate = "{$base}-{$color}";
    elseif ($size !== '') $candidate = "{$base}-{$size}";

    $sameCandidate = 0;
    foreach ($all as $item) {
        $itemBase = !empty($item['slug']) ? slugify((string)$item['slug']) : slugify((string)($item['name'] ?? ''));
        $iColor = (!empty($item['colors']) && is_array($item['colors']) && !empty($item['colors'][0])) ? slugify((string)$item['colors'][0]) : '';
        $iSize = (!empty($item['sizes']) && is_array($item['sizes']) && !empty($item['sizes'][0])) ? slugify((string)$item['sizes'][0]) : '';
        $c = $itemBase;
        if ($iColor !== '' && $iSize !== '') $c = "{$itemBase}-{$iColor}-{$iSize}";
        elseif ($iColor !== '') $c = "{$itemBase}-{$iColor}";
        elseif ($iSize !== '') $c = "{$itemBase}-{$iSize}";
        if ($c === $candidate) $sameCandidate++;
    }

    if ($sameCandidate <= 1) return $candidate;

    $suffix = substr((string)($p['id'] ?? ''), -3);
    return $suffix !== '' ? "{$candidate}-{$suffix}" : $candidate;
}

$product = null;
$q = strtolower($productQuery);
foreach ($products as $p) {
    if (isset($p['id']) && strtolower((string)$p['id']) === $q) {
        $product = $p;
        break;
    }
}
if (!$product) {
    foreach ($products as $p) {
        if (getProductCleanSlug($p, $products) === $q) {
            $product = $p;
            break;
        }
    }
}
if (!$product) {
    foreach ($products as $p) {
        if (isset($p['slug']) && strtolower((string)$p['slug']) === $q) {
            $product = $p;
            break;
        }
    }
}

if (!$product) {
    http_response_code(404);
    exit('Produto não encontrado');
}

$img = $product['image'] ?? ($product['images'][0] ?? '');
if (empty($img)) {
    http_response_code(404);
    exit('Imagem não encontrada');
}

$parsed = parse_url($img, PHP_URL_PATH);
$relPath = ltrim((string)$parsed, '/');
$filePath = __DIR__ . '/../' . $relPath;

if (!file_exists($filePath)) {
    header('Location: ' . $img, true, 302);
    exit;
}

$ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
$mimeMap = [
    'webp' => 'image/webp',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png'  => 'image/png',
    'avif' => 'image/avif',
];
$mime = $mimeMap[$ext] ?? 'application/octet-stream';

header('Content-Type: ' . $mime);
header('Cache-Control: public, max-age=31536000, immutable');
header('Content-Length: ' . filesize($filePath));
readfile($filePath);
exit;
