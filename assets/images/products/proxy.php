<?php
// NT ELEGANZ — Proxy e Cache Inteligente de Imagens
// Se um arquivo não existir no disco da Hostinger, busca na VPS, grava no disco e devolve HTTP 200 OK
$img = isset($_GET['img']) ? basename((string)$_GET['img']) : '';
if (!$img || !preg_match('/^[a-zA-Z0-9_.-]+\.(webp|png|jpe?g|avif)$/i', $img)) {
    http_response_code(404);
    exit('Imagem inválida');
}

$localPath = __DIR__ . '/' . $img;
if (file_exists($localPath) && filesize($localPath) > 0) {
    $ext = strtolower(pathinfo($img, PATHINFO_EXTENSION));
    $mime = ($ext === 'webp') ? 'image/webp' : (($ext === 'png') ? 'image/png' : 'image/jpeg');
    header('Content-Type: ' . $mime);
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Content-Length: ' . filesize($localPath));
    readfile($localPath);
    exit;
}

$vpsUrl = 'https://137-131-233-254.sslip.io/nteleganz/uploads/' . $img;
$ch = curl_init($vpsUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => 0,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT => 8,
]);
$data = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($code === 200 && !empty($data)) {
    @file_put_contents($localPath, $data);
    $ext = strtolower(pathinfo($img, PATHINFO_EXTENSION));
    $mime = ($ext === 'webp') ? 'image/webp' : (($ext === 'png') ? 'image/png' : 'image/jpeg');
    header('Content-Type: ' . $mime);
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Content-Length: ' . strlen($data));
    echo $data;
    exit;
}

http_response_code(404);
exit('Imagem não encontrada');
