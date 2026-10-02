<?php
// NT ELEGANZ — Product Social Metadata & OpenGraph Handler
$productId = isset($_GET['id']) ? trim((string)$_GET['id']) : '';
$productSlug = isset($_GET['slug']) ? trim((string)$_GET['slug']) : '';

$htmlPath = __DIR__ . '/index.html';
if (!file_exists($htmlPath)) {
    http_response_code(404);
    exit('Página não encontrada.');
}

$html = file_get_contents($htmlPath);

if ($productId !== '' || $productSlug !== '') {
    $product = null;
    $dataPath = __DIR__ . '/../data/products.json';
    if (file_exists($dataPath)) {
        $json = @file_get_contents($dataPath);
        if ($json !== false) {
            $data = @json_decode($json, true);
            if (is_array($data) && isset($data['products']) && is_array($data['products'])) {
                foreach ($data['products'] as $p) {
                    if (($productId !== '' && isset($p['id']) && (string)$p['id'] === $productId) ||
                        ($productSlug !== '' && isset($p['slug']) && (string)$p['slug'] === $productSlug)) {
                        $product = $p;
                        break;
                    }
                }
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

        // Image URL
        $img = '';
        if (!empty($product['image']) && is_string($product['image'])) {
            $img = $product['image'];
        } elseif (!empty($product['images']) && is_array($product['images']) && !empty($product['images'][0])) {
            $img = $product['images'][0];
        }

        if ($img !== '') {
            if (strpos($img, 'http://') !== 0 && strpos($img, 'https://') !== 0) {
                $img = 'https://nteleganz.com.br/' . ltrim($img, '/');
            }
            $imgEscaped = htmlspecialchars($img, ENT_QUOTES, 'UTF-8');

            $html = preg_replace('/<meta\s+property=["\']og:image["\']\s+content=["\'][^"\']*["\']\s*\/?>/i', '<meta property="og:image" content="' . $imgEscaped . '" />', $html, 1);
            $html = preg_replace('/<meta\s+name=["\']twitter:image["\']\s+content=["\'][^"\']*["\']\s*\/?>/i', '<meta name="twitter:image" content="' . $imgEscaped . '" />', $html);
        }

        $canonicalId = !empty($product['id']) ? $product['id'] : $productId;
        $canonical = 'https://nteleganz.com.br/products/?id=' . urlencode($canonicalId);

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
