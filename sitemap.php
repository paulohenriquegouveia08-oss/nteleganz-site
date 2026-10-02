<?php
/* ============================================
   NT ELEGANZ — SITEMAP DINÂMICO
   Páginas estáticas + produtos ativos (Supabase).
   A chave abaixo é a pública (Já usada pelo JS do site);
   o Supabase protege escrita via RLS.
   ============================================ */

declare(strict_types=1);

const SITE_URL    = 'https://nteleganz.com.br';
const SUPABASE_URL = 'https://erpyzjxtxztokpxxpirq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vvD9OIWTX6dzYm9fFTa4yw_aRLZfYwU';

const STATIC_URLS = [
    ['/',                 '2026-09-22', '1.0', 'weekly'],
    ['/collections/',     '2026-09-22', '0.9', 'daily'],
    ['/collections/camisetas/', '2026-09-22', '0.8', 'daily'],
    ['/collections/calcados/',  '2026-09-22', '0.8', 'daily'],
    ['/collections/hoodies/',   '2026-09-22', '0.8', 'daily'],
    ['/collections/shorts/',    '2026-09-22', '0.8', 'daily'],
];

header('Content-Type: application/xml; charset=UTF-8');
header('X-Robots-Tag: noindex');
header('Cache-Control: public, max-age=3600');

/** @return array<int, array<string, mixed>> */
function fetchProducts(): array
{
    $url = SUPABASE_URL . '/rest/v1/products?select=id,updated_at,active,available&limit=1000&order=created_at.asc';
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Accept: application/json\r\napikey: " . SUPABASE_KEY . "\r\nAuthorization: Bearer " . SUPABASE_KEY,
            'timeout' => 8,
        ],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $body = @file_get_contents($url, false, $context);
    if ($body === false) return [];
    $json = json_decode($body, true);
    return is_array($json) ? $json : [];
}

$urls = STATIC_URLS;
foreach (fetchProducts() as $product) {
    $id = $product['id'] ?? null;
    if ($id === null || $id === '') continue;
    if (($product['active'] ?? null) === false || ($product['available'] ?? null) === false) continue;
    $lastmod = is_string($product['updated_at'] ?? null) ? substr($product['updated_at'], 0, 10) : '';
    $urls[] = ['/products/?id=' . rawurlencode((string) $id), $lastmod, '0.7', 'weekly'];
}

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($urls as [$path, $lastmod, $priority, $frequency]) {
    $loc = SITE_URL . '/' . ltrim(htmlspecialchars($path, ENT_XML1 | ENT_QUOTES, 'UTF-8'), '/');
    echo "  <url>\n";
    echo '    <loc>' . $loc . "</loc>\n";
    echo '    <lastmod>' . ($lastmod !== '' ? $lastmod : date('Y-m-d')) . "</lastmod>\n";
    echo '    <changefreq>' . $frequency . "</changefreq>\n";
    echo '    <priority>' . $priority . "</priority>\n";
    echo "  </url>\n";
}
echo "</urlset>\n";