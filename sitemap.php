<?php
/* ============================================
   NT ELEGANZ — SITEMAP DINÂMICO
   Páginas estáticas + produtos com URLs mascaradas.
   ============================================ */

declare(strict_types=1);

const SITE_URL = 'https://nteleganz.com.br';

const STATIC_URLS = [
    ['/',                       '2026-10-02', '1.0', 'weekly'],
    ['/collections/',           '2026-10-02', '0.9', 'daily'],
    ['/collections/camisetas/', '2026-10-02', '0.8', 'daily'],
    ['/collections/calcados/',  '2026-10-02', '0.8', 'daily'],
    ['/collections/hoodies/',   '2026-10-02', '0.8', 'daily'],
    ['/collections/shorts/',    '2026-10-02', '0.8', 'daily'],
];

header('Content-Type: application/xml; charset=UTF-8');
header('X-Robots-Tag: noindex');
header('Cache-Control: public, max-age=3600');

function slugify(string $text): string
{
    $text = preg_replace('~[^\pL\d]+~u', '-', $text);
    $text = iconv('utf-8', 'us-ascii//TRANSLIT', $text);
    $text = preg_replace('~[^-\w]+~', '', $text);
    $text = trim($text, '-');
    $text = preg_replace('~-+~', '-', $text);
    return strtolower($text);
}

function getProductCleanSlug(array $p, array $all): string
{
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

/** @return array<int, array<string, mixed>> */
function fetchProducts(): array
{
    $dataPath = __DIR__ . '/data/products.json';
    if (file_exists($dataPath)) {
        $json = @file_get_contents($dataPath);
        if ($json !== false) {
            $data = @json_decode($json, true);
            if (is_array($data) && isset($data['products']) && is_array($data['products'])) {
                return $data['products'];
            }
        }
    }
    return [];
}

$urls = STATIC_URLS;
$allProducts = fetchProducts();
foreach ($allProducts as $product) {
    $id = $product['id'] ?? null;
    if ($id === null || $id === '') continue;
    if (($product['active'] ?? null) === false || ($product['available'] ?? null) === false) continue;
    $lastmod = is_string($product['updated_at'] ?? null) ? substr($product['updated_at'], 0, 10) : (is_string($product['updatedAt'] ?? null) ? substr($product['updatedAt'], 0, 10) : '');
    $slug = getProductCleanSlug($product, $allProducts);
    $urls[] = ['/products/?p=' . rawurlencode($slug), $lastmod, '0.7', 'weekly'];
}

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($urls as [$path, $lastmod, $priority, $frequency]) {
    $loc = SITE_URL . '/' . ltrim(htmlspecialchars((string)$path, ENT_XML1 | ENT_QUOTES, 'UTF-8'), '/');
    echo "  <url>\n";
    echo '    <loc>' . $loc . "</loc>\n";
    echo '    <lastmod>' . ($lastmod !== '' ? $lastmod : date('Y-m-d')) . "</lastmod>\n";
    echo '    <changefreq>' . $frequency . "</changefreq>\n";
    echo '    <priority>' . $priority . "</priority>\n";
    echo "  </url>\n";
}
echo "</urlset>\n";