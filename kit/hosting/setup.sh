#!/usr/bin/env bash
# One-time AWS setup for rooms.isopolis.city, mirroring sfcity/fleetweek: a CloudFront
# distribution on the shared private `isopolis` bucket (origin path /rooms), the existing
# *.isopolis.city certificate and origin access control, and a bucket-policy grant for
# rooms/* only. Writes the distribution id and domain to .env, then prints the DNS record.
# Safe to re-run: each step is skipped when already done.
#
#   bash kit/hosting/setup.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[ -f "$ROOT/.env" ] || cp "$ROOT/.env.example" "$ROOT/.env"
set -a; . "$ROOT/.env"; set +a
ALIAS="${ROOMS_ORIGIN#https://}"
CERT=arn:aws:acm:us-east-1:571600854010:certificate/909580ea-2fe0-48ef-baed-52c1b4a21f09  # *.isopolis.city
OAC=EZVFHUNVWJL0H                                     # origin access control shared with fleet
CACHE=658327ea-f89d-4fab-a63d-7e88639e58f6            # Managed-CachingOptimized
HEADERS=67f7725c-6f97-4210-82d7-5512b31e9d03          # Managed-SecurityHeadersPolicy
FN=rooms-index

# 1. Viewer-request function: folder URLs serve index.html; /name redirects to /name/.
if ! aws cloudfront describe-function --name "$FN" --stage LIVE >/dev/null 2>&1; then
  ETAG=$(aws cloudfront create-function --name "$FN" \
    --function-config "Comment=Folder index for $ALIAS,Runtime=cloudfront-js-2.0" \
    --function-code "fileb://$ROOT/kit/hosting/rooms-index.js" --query ETag --output text)
  aws cloudfront publish-function --name "$FN" --if-match "$ETAG" >/dev/null
fi
FN_ARN=$(aws cloudfront describe-function --name "$FN" --stage LIVE --query FunctionSummary.FunctionMetadata.FunctionARN --output text)

# 2. Distribution.
if [ -z "${ROOMS_DISTRIBUTION_ID:-}" ]; then
  CONFIG=$(cat <<JSON
{
  "CallerReference": "rooms-isopolis-$(date +%Y%m%d%H%M%S)",
  "Aliases": {"Quantity": 1, "Items": ["$ALIAS"]},
  "DefaultRootObject": "index.html",
  "Origins": {"Quantity": 1, "Items": [{
    "Id": "rooms-s3", "DomainName": "$ROOMS_BUCKET.s3.$AWS_REGION.amazonaws.com", "OriginPath": "/$ROOMS_PREFIX",
    "S3OriginConfig": {"OriginAccessIdentity": ""}, "OriginAccessControlId": "$OAC"}]},
  "DefaultCacheBehavior": {
    "TargetOriginId": "rooms-s3", "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {"Quantity": 2, "Items": ["HEAD", "GET"], "CachedMethods": {"Quantity": 2, "Items": ["HEAD", "GET"]}},
    "Compress": true, "CachePolicyId": "$CACHE", "ResponseHeadersPolicyId": "$HEADERS",
    "FunctionAssociations": {"Quantity": 1, "Items": [{"FunctionARN": "$FN_ARN", "EventType": "viewer-request"}]}},
  "Comment": "Rooms: interactive 3D home studies",
  "PriceClass": "PriceClass_All", "Enabled": true,
  "ViewerCertificate": {"ACMCertificateArn": "$CERT", "SSLSupportMethod": "sni-only", "MinimumProtocolVersion": "TLSv1.2_2021"},
  "HttpVersion": "http2", "IsIPV6Enabled": true
}
JSON
)
  read -r ROOMS_DISTRIBUTION_ID ROOMS_CLOUDFRONT_DOMAIN < <(aws cloudfront create-distribution \
    --distribution-config "$CONFIG" --query 'Distribution.[Id,DomainName]' --output text)
  sed -i '' -e "s/^ROOMS_DISTRIBUTION_ID=.*/ROOMS_DISTRIBUTION_ID=$ROOMS_DISTRIBUTION_ID/" \
            -e "s/^ROOMS_CLOUDFRONT_DOMAIN=.*/ROOMS_CLOUDFRONT_DOMAIN=$ROOMS_CLOUDFRONT_DOMAIN/" "$ROOT/.env"
fi

# 3. Bucket policy: let this distribution read rooms/* (other grants are left as they are).
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
POLICY=$(aws s3api get-bucket-policy --bucket "$ROOMS_BUCKET" --query Policy --output text)
UPDATED=$(node -e '
  const [policy,bucket,prefix,arn]=process.argv.slice(1),p=JSON.parse(policy);
  if(p.Statement.some(s=>s.Sid==="AllowRoomsCloudFront")){process.exit(0);}
  p.Statement.push({Sid:"AllowRoomsCloudFront",Effect:"Allow",Principal:{Service:"cloudfront.amazonaws.com"},
    Action:"s3:GetObject",Resource:`arn:aws:s3:::${bucket}/${prefix}/*`,Condition:{StringEquals:{"AWS:SourceArn":arn}}});
  console.log(JSON.stringify(p));' "$POLICY" "$ROOMS_BUCKET" "$ROOMS_PREFIX" "arn:aws:cloudfront::$ACCOUNT:distribution/$ROOMS_DISTRIBUTION_ID")
[ -z "$UPDATED" ] || aws s3api put-bucket-policy --bucket "$ROOMS_BUCKET" --policy "$UPDATED"

echo
echo "Distribution $ROOMS_DISTRIBUTION_ID is deploying (CloudFront takes a few minutes)."
echo "DNS at Spaceship: CNAME  host: ${ALIAS%%.*}  value: $ROOMS_CLOUDFRONT_DOMAIN  TTL: 5 min"
echo "Then: kit/home deploy <project>   ->   $ROOMS_ORIGIN/<project>/"
