<?php
// NT ELEGANZ — Product Social Metadata & OpenGraph Handler
$productQuery = isset($_GET['p']) ? trim((string)$_GET['p']) : (isset($_GET['slug']) ? trim((string)$_GET['slug']) : (isset($_GET['id']) ? trim((string)$_GET['id']) : ''));

$htmlPath = __DIR__ . '/index.html';
if (!file_exists($htmlPath)) {
    http_response_code(404);
    exit('Página não encontrada.');
}

$html = file_get_contents($htmlPath);

function slugify($text) {
    $text = preg_replace('~[^\pL\d]+~u', '-', (string)$text);
    $text = iconv('utf-8', 'us-ascii//TRANSLIT', $text);
    $text = preg_replace('~[^-\w]+~', '', $text);
    $text = trim($text, '-');
    $text = preg_replace('~-+~', '-', $text);
    return strtolower($text);
}

function getProductCleanSlug($p, $all) {
    $base = !empty($p['slug']) ? slugify($p['slug']) : slugify($p['name'] ?? '');
    if (empty($all) || count($all) <= 1) return $base;

    $duplicates = 0;
    foreach ($all as $item) {
        $itemBase = !empty($item['slug']) ? slugify($item['slug']) : slugify($item['name'] ?? '');
        if ($itemBase === $base) $duplicates++;
    }
    if ($duplicates <= 1) return $base;

    $color = (!empty($p['colors']) && is_array($p['colors']) && !empty($p['colors'][0])) ? slugify($p['colors'][0]) : '';
    $size = (!empty($p['sizes']) && is_array($p['sizes']) && !empty($p['sizes'][0])) ? slugify($p['sizes'][0]) : '';

    $candidate = $base;
    if ($color !== '' && $size !== '') $candidate = "{$base}-{$color}-{$size}";
    elseif ($color !== '') $candidate = "{$base}-{$color}";
    elseif ($size !== '') $candidate = "{$base}-{$size}";

    $sameCandidate = 0;
    foreach ($all as $item) {
        $itemBase = !empty($item['slug']) ? slugify($item['slug']) : slugify($item['name'] ?? '');
        $iColor = (!empty($item['colors']) && is_array($item['colors']) && !empty($item['colors'][0])) ? slugify($item['colors'][0]) : '';
        $iSize = (!empty($item['sizes']) && is_array($item['sizes']) && !empty($item['sizes'][0])) ? slugify($item['sizes'][0]) : '';
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

if ($productQuery !== '') {
    $product = null;
    $allProducts = [];
    $dataPath = __DIR__ . '/../data/products.json';
    if (file_exists($dataPath)) {
        $json = @file_get_contents($dataPath);
        if ($json !== false) {
            $data = @json_decode($json, true);
            if (is_array($data) && isset($data['products']) && is_array($data['products'])) {
                $allProducts = $data['products'];
            }
        }
    }

    $q = strtolower($productQuery);

    // 1. Exact ID match (retrocompatibilidade)
    foreach ($allProducts as $p) {
        if (isset($p['id']) && strtolower((string)$p['id']) === $q) {
            $product = $p;
            break;
        }
    }

    // 2. Clean slug match
    if (!$product) {
        foreach ($allProducts as $p) {
            if (getProductCleanSlug($p, $allProducts) === $q) {
                $product = $p;
                break;
            }
        }
    }

    // 3. Raw slug match
    if (!$product) {
        foreach ($allProducts as $p) {
            if (isset($p['slug']) && strtolower((string)$p['slug']) === $q) {
                $product = $p;
                break;
            }
        }
    }

    if ($product && is_array($product)) {
        $name = htmlspecialchars($product['name'] ?? 'Produto', ENT_QUOTES, 'UTF-8');
        $brand = htmlspecialchars($product['brand'] ?? 'NT Eleganz', ENT_QUOTES, 'UTF-8');
        $title = "{$brand} — {$name} | NT Eleganz";
        $price = htmlspecialchars($product['price'] ?? '', ENT_QUOTES, 'UTF-8');
        $rawDesc = !empty($product['desc']) ? $product['desc'] : "{$name}, da {$brand}. Produto original e autenticado pela NT Eleganz.";
        $desc = htmlspecialchars($rawDesc, ENT_QUOTES, 'UTF-8');
        if ($price !== '') {
            $desc = "{$price} — {$desc}";
        }

        $cleanSlug = getProductCleanSlug($product, $allProducts);
        $canonical = 'https://nteleganz.com.br/products/?p=' . urlencode($cleanSlug);
        $cleanPhoto = 'https://nteleganz.com.br/foto/?p=' . urlencode($cleanSlug);

        $html = preg_replace('/<meta\s+property=["\']og:image["\']\s+content=["\'][^"\']*["\']\s*\/?>/i', '<meta property="og:image" content="' . $cleanPhoto . '" />', $html, 1);
        $html = preg_replace('/<meta\s+name=["\']twitter:image["\']\s+content=["\'][^"\']*["\']\s*\/?>/i', '<meta name="twitter:image" content="' . $cleanPhoto . '" />', $html);

        $html = preg_replace('/<title[^>]*>.*?<\/title>/i', "<title id=\"page-title\">{$title}</title>", $html, 1);
        $html = preg_replace('/<meta\s+property=["\']og:title["\']\s+content=["\'][^"\']*["\']\s*\/?>/i', '<meta property="og:title" content="' . $title . '" />', $html, 1);
        $html = preg_replace('/<meta\s+name=["\']twitter:title["\']\s+content=["\'][^"\']*["\']\s*\/?>/i', '<meta name="twitter:title" content="' . $title . '" />', $html, 1);
        $html = preg_replace('/<meta\s+name=["\']description["\']\s+id=["\']page-desc["\']\s+content=["\'][^"\']*["\']\s*\/?>/i', '<meta name="description" id="page-desc" content="' . $desc . '" />', $html, 1);
        $html = preg_replace('/<meta\s+property=["\']og:description["\']\s+content=["\'][^"\']*["\']\s*\/?>/i', '<meta property="og:description" content="' . $desc . '" />', $html, 1);
        $html = preg_replace('/<meta\s+name=["\']twitter:description["\']\s+content=["\'][^"\']*["\']\s*\/?>/i', '<meta name="twitter:description" content="' . $desc . '" />', $html, 1);
        $html = preg_replace('/<meta\s+property=["\']og:url["\']\s+content=["\'][^"\']*["\']\s*\/?>/i', '<meta property="og:url" content="' . $canonical . '" />', $html, 1);
        $html = preg_replace('/<link\s+rel=["\']canonical["\']\s+href=["\'][^"\']*["\']\s*\/?>/i', '<link rel="canonical" href="' . $canonical . '" />', $html, 1);
    }
}

header('Content-Type: text/html; charset=UTF-8');
echo $html;
