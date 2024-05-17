function handler(event) {
    var request = event.request;
    var uri = request.uri;
    // this function rewrites to index.html the requests with virtual path /store-name/language/currency default routing for SAP Composable Storefront (CS).
    // without this function the default routing of CS will generate a 403 HTTP error (managed in Cloudfront) because the path does not exist nor in S3 nor in the OCC.
    request.uri = '/index.html';

    return request;
}