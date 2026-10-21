// CloudFront viewer-request function for rooms.isopolis.city: each home is a folder
// (/kalpataru-radiance/). Folder URLs serve their index.html; a bare /name gets a slash so
// the page's relative asset paths resolve inside the folder.
function handler(event) {
  var request = event.request, uri = request.uri;
  if (uri.endsWith('/')) { request.uri = uri + 'index.html'; return request; }
  if (uri.split('/').pop().indexOf('.') === -1) {
    return {statusCode: 301, statusDescription: 'Moved Permanently', headers: {location: {value: uri + '/'}}};
  }
  return request;
}
