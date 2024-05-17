import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';


import { ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';

/**
 * This AWs CDK Stack deploys an Amazon CloudFront Distribution for: 
 * - SAP Composable Storefront PWA deployed on Amazon S3 bucket
 * - SAP Commerce Cloud API REST APIs
 * A Route53 A record is then created to resolve the CloudFront distribution with the configured domain name
 */
export class SAPCommerceCloudWithCloudfrontStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //// Defining CloudFormation parameters
    const sapBucketNameParam = new cdk.CfnParameter(this, "sapBucketNameParam", {
      type: "String",
      description: "The name of the Amazon S3 bucket where to store the SAP Composable Storefront application."
    });

    const hostedZoneIdParam = new cdk.CfnParameter(this, "hostedZoneIdParam", {
      type: "String",
      description: "The Route53 hosted zone id."
    });

    const domainNameParam = new cdk.CfnParameter(this, "domainNameParam", {
      type: "String",
      description: "The domainName from Route53 hosted zone."
    });

    const siteNameParam = new cdk.CfnParameter(this, "siteNameParam", {
      type: "String",
      description: "The SAP Commerce Cloud site id",
      default: "electronics-spa"
    });

    const sapCommerceCloudApiAspectEndpointParam = new cdk.CfnParameter(this, "sapCommerceCloudApiAspectEndpointParam", {
      type: "String",
      description: "The SAP Commerce Cloud api aspect endpoint. Eg: api.abcdefghil-customer1-d1-public.model-t.cc.commerce.ondemand.com"
    });

    const composableStorefrontStoreNameParam = new cdk.CfnParameter(this, "composableStorefrontStoreNameParam", {
      type: "String",
      description: "The SAP Composable Storeftont store name",
      default: "mystore"
    });

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'hostedZone', {
      hostedZoneId: hostedZoneIdParam.valueAsString,
      zoneName: domainNameParam.valueAsString
    });


    const domainName = domainNameParam.valueAsString;
    const siteName = siteNameParam.valueAsString
    const siteDomainName = siteName.concat(".").concat(domainName)

    //// the S3 bucket that will be used to deploy the SAP Compoable Storefront application
    const assetsBucket = new s3.Bucket(this, 'SAPComposableStorefrontBucket', {
      bucketName: sapBucketNameParam.valueAsString,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      accessControl: s3.BucketAccessControl.PRIVATE,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    //// The SSL certificate to be configured in the cloudfront distribution for the configured doamain name
    const certificate = new acm.Certificate(this, "sap-composable-storefront-acm-certificate", {
      domainName: domainName,
      subjectAlternativeNames: [siteDomainName],
      validation: acm.CertificateValidation.fromDns(zone),
    });


    //// defining url paths variables
    const ROOT_OCC_URL = "/occ/v2"
    const ROOT_STATIC_URL = `/${siteName}/*`
    const SITE_OCC_URL = `${ROOT_OCC_URL}/${siteName}`
    const BASESITE_OCC_URL = `${ROOT_OCC_URL}/basesites`
    const CMS_PAGES_OCC_URL = `${SITE_OCC_URL}/cms/pages`
    const CMS_COMPONENTS_OCC_URL = `${SITE_OCC_URL}/cms/components`
    const PRODUCTS_OCC_URL = `${SITE_OCC_URL}/products/*`
    const SEARCH_OCC_URL = `${SITE_OCC_URL}/products/search`
    const MEDIAS_URL = `/medias/*`
    const USERS_OCC_URL = `${SITE_OCC_URL}/users/*`
    const LANGUAGES_OCC_URL = `${SITE_OCC_URL}/languages`
    const CURRENCIES_OCC_URL = `${SITE_OCC_URL}/currencies`
    const CONSENT_TEMPLATE_OCC_URL = `${SITE_OCC_URL}/users/anonymous/consenttemplates`


    //// This function sets the path to index.html for all the request to the virtual path used for Angular routing
    const rewriteUrlFunction = new cloudfront.Function(this,"rewriteUrlFunction", {
      code: cloudfront.FunctionCode.fromFile({filePath: "functions/rewriteUrl/index.js"}),
      functionName: "rewriteUrlFunction",
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: "This function rewrites the url of the SAP Composable Storefront request with virtual path for Angular routing"
    })

    //// CloudFront Origins
    //Create the static content origin
    const staticResourceOrigin = new origins.S3Origin(assetsBucket, {
      originPath: "/".concat(composableStorefrontStoreNameParam.valueAsString),
    });

    //Create the dynamic content origin
    const restApiOrigin = new origins.HttpOrigin(sapCommerceCloudApiAspectEndpointParam.valueAsString, {

    });



    //// response headers with specific Cache-Control header configuration

    const staticResourcesResponseHeaderPolicy = new cloudfront.ResponseHeadersPolicy(this, 'staticResourcesResponseHeaderPolicy', {
      responseHeadersPolicyName: 'staticResourcesResponseHeaderPolicy',
      comment: 'staticResourcesResponseHeaderPolicy',  
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400, immutable, stale-if-error=0', override: true },
        ],
      },
    });

    const cacheControl3600sResponseHeaderPolicy = new cloudfront.ResponseHeadersPolicy(this, 'cacheControl3600sResponseHeaderPolicy', {
      responseHeadersPolicyName: 'cacheControl3600sResponseHeaderPolicy',
      comment: 'cacheControl3600sResponseHeaderPolicy',
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Cache-Control', value: 'public, max-age=3600', override: true },
        ],
      },
    })

    const noCacheControlResponseHeaderPolicy = new cloudfront.ResponseHeadersPolicy(this, 'noCacheControlResponseHeaderPolicy', {
      responseHeadersPolicyName: 'noCacheControlResponseHeaderPolicy',
      comment: 'noCacheControlResponseHeaderPolicy',
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Cache-Control', value: 'no-cache, no-store, max-age=0, must-revalidate', override: true },
        ],
      },
    });


    //// The CloudFront Distribution with default behavior
    const cloudfrontDistribution = new cloudfront.Distribution(this, 'CloudFrontDistribution', {
      comment: '(BLOG)Cloudfront distribution for SAP Composable Storefront',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      certificate: certificate,
      domainNames: [domainName, siteDomainName],
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(30),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(30),
        },
      ],
      defaultRootObject: 'index.html',
      defaultBehavior: {
        //This behavior represents all the static content that must be cached
        origin: staticResourceOrigin,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: noCacheControlResponseHeaderPolicy,
        compress: true
      },
    });



    //// configure OAC for S3 bucket and CloudFront
    const oac = new cloudfront.CfnOriginAccessControl(this, 'ComposableStorefrontOriginAccessControl', {
      originAccessControlConfig: {
        name: 'ComposableStorefrontOriginAccessControl',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4'
      }
    });

    //configure S3 Bucket to be accessed by Cloudfront only
    const allowCloudFrontReadOnlyPolicy = new iam.PolicyStatement({
      sid: 'allowCloudFrontReadOnlyPolicy',
      actions: ['s3:GetObject'],
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      effect: iam.Effect.ALLOW,
      conditions: {
        'StringEquals': {
          "AWS:SourceArn": "arn:aws:cloudfront::" + this.account + ":distribution/" + cloudfrontDistribution.distributionId
        }
      },
      resources: [assetsBucket.bucketArn, assetsBucket.bucketArn.concat('/').concat('*')]
    });
    assetsBucket.addToResourcePolicy(allowCloudFrontReadOnlyPolicy)

    // OAC is not supported by CDK L2 construct yet. L1 construct is required
    const cfnDistribution = cloudfrontDistribution.node.defaultChild as cloudfront.CfnDistribution
    //enable OAC
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.OriginAccessControlId',
      oac.getAtt('Id')
    )
    //disable OAI
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity',
      '',
    )

    //// CloudFront caching policies
    const oneHourCachingPolicy = new cloudfront.CachePolicy(this, 'oneDayCachingPolicy', {
      cachePolicyName: 'oneDayCachingPolicy',
      defaultTtl: Duration.hours(1),
      minTtl: Duration.hours(1),
      maxTtl: Duration.hours(1),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all()      
    });    



    //// set the cloudfront distribution behaviors
    
    //static resources
    cloudfrontDistribution.addBehavior("/chunk*.js", staticResourceOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: staticResourcesResponseHeaderPolicy,
      compress: true
    });
    cloudfrontDistribution.addBehavior("/polyfills*.js", staticResourceOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: staticResourcesResponseHeaderPolicy,
      compress: true
    });
    cloudfrontDistribution.addBehavior("/main*.js", staticResourceOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: staticResourcesResponseHeaderPolicy,
      compress: true
    });
    
    cloudfrontDistribution.addBehavior("/styles*.css", staticResourceOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: staticResourcesResponseHeaderPolicy,
      compress: true
    });
    cloudfrontDistribution.addBehavior("/media/*", staticResourceOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: staticResourcesResponseHeaderPolicy,
      compress: true
    });
    cloudfrontDistribution.addBehavior("/favicon.ico", staticResourceOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: staticResourcesResponseHeaderPolicy,
      compress: true
    });
    cloudfrontDistribution.addBehavior("/assets/*", staticResourceOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: staticResourcesResponseHeaderPolicy,
      compress: true
    });

    cloudfrontDistribution.addBehavior(ROOT_STATIC_URL, staticResourceOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'rootStaticResourcesResponseHeaderPolicy', {
        responseHeadersPolicyName: 'rootStaticResourcesResponseHeaderPolicy',
        comment: 'rootStaticResourcesResponseHeaderPolicy',  
        customHeadersBehavior: {
          customHeaders: [
            { header: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=86400, stale-if-error=0', override: true },
          ],
        },
      }),
      compress: true,
      functionAssociations: [
        {
          function: rewriteUrlFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST
        }
      ]
    });

    //dynamic resources
    cloudfrontDistribution.addBehavior('/authorizationserver/*', restApiOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: noCacheControlResponseHeaderPolicy,
      compress: true
    });

    
    cloudfrontDistribution.addBehavior(CMS_PAGES_OCC_URL, restApiOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: new cloudfront.CachePolicy(this, 'cmsPagesCachingPolicy', {
        cachePolicyName: 'cmsPagesCachingPolicy',
        defaultTtl: Duration.seconds(600),
        minTtl: Duration.seconds(600),
        maxTtl: Duration.seconds(600),
        enableAcceptEncodingBrotli: true,
        enableAcceptEncodingGzip: true,
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.all()      
      }),
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'cmsPagesResponseHeaderPolicy', {
        responseHeadersPolicyName: 'cmsPagesResponseHeaderPolicy',
        comment: 'cmsPagesResponseHeaderPolicy',
        customHeadersBehavior: {
          customHeaders: [
            { header: 'Cache-Control', value: 'public, max-age=600', override: true },
          ],
        },
      }),      
      compress: true
    });


    
    cloudfrontDistribution.addBehavior(CMS_COMPONENTS_OCC_URL, restApiOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: new cloudfront.CachePolicy(this, 'cmsComponentsCachingPolicy', {
        cachePolicyName: 'cmsComponentsCachingPolicy',
        defaultTtl: Duration.seconds(3600),
        minTtl: Duration.seconds(3600),
        maxTtl: Duration.seconds(3600),
        enableAcceptEncodingBrotli: true,
        enableAcceptEncodingGzip: true,
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.all()      
      }),
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'cmsComponentsResponseHeaderPolicy', {
        responseHeadersPolicyName: 'cmsComponentsResponseHeaderPolicy',
        comment: 'cmsComponentsResponseHeaderPolicy',
        customHeadersBehavior: {
          customHeaders: [
            { header: 'Cache-Control', value: 'public, max-age=3600', override: true },
          ],
        },
      }),
      compress: true
    });

    cloudfrontDistribution.addBehavior(PRODUCTS_OCC_URL, restApiOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: oneHourCachingPolicy,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'pdpResponseHeaderPolicy', {
        responseHeadersPolicyName: 'pdpResponseHeaderPolicy',
        comment: 'pdpResponseHeaderPolicy',
        customHeadersBehavior: {
          customHeaders: [
            { header: 'Cache-Control', value: 'public, max-age=120', override: true },
          ],
        },
      }),
      compress: true
    });

    cloudfrontDistribution.addBehavior(SEARCH_OCC_URL, restApiOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: oneHourCachingPolicy,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'plpResponseHeaderPolicy', {
        responseHeadersPolicyName: 'plpResponseHeaderPolicy',
        comment: 'plpResponseHeaderPolicy',
        customHeadersBehavior: {
          customHeaders: [
            { header: 'Cache-Control', value: 'public, max-age=120', override: true },
          ],
        },
      }),
      compress: true
    });
    
    cloudfrontDistribution.addBehavior(MEDIAS_URL, restApiOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: new cloudfront.CachePolicy(this, 'oneYearCachingPolicy', {
        cachePolicyName: 'oneYearCachingPolicy',
        defaultTtl: Duration.days(365),
        minTtl: Duration.days(1),
        maxTtl: Duration.days(365),
        enableAcceptEncodingBrotli: true,
        enableAcceptEncodingGzip: true,
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.all()      
      }),
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'mediasResourcesResponseHeaderPolicy', {
        responseHeadersPolicyName: 'mediasResourcesResponseHeaderPolicy',
        comment: 'mediasResourcesResponseHeaderPolicy',  
        customHeadersBehavior: {
          customHeaders: [
            { header: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=86400, immutable, stale-if-error=0', override: true },
          ],
        },
      }),
      compress: true
    });

    cloudfrontDistribution.addBehavior(BASESITE_OCC_URL, restApiOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: oneHourCachingPolicy,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: cacheControl3600sResponseHeaderPolicy,
      compress: true

    });


    cloudfrontDistribution.addBehavior(LANGUAGES_OCC_URL, restApiOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: oneHourCachingPolicy,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: cacheControl3600sResponseHeaderPolicy,
      compress: true
    });
    cloudfrontDistribution.addBehavior(CURRENCIES_OCC_URL, restApiOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: oneHourCachingPolicy,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: cacheControl3600sResponseHeaderPolicy,
      compress: true
    });

    cloudfrontDistribution.addBehavior(CONSENT_TEMPLATE_OCC_URL, restApiOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: oneHourCachingPolicy,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: cacheControl3600sResponseHeaderPolicy,
      compress: true
    });

    cloudfrontDistribution.addBehavior(USERS_OCC_URL, restApiOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: noCacheControlResponseHeaderPolicy,
      compress: true
    });

    cloudfrontDistribution.addBehavior(`${ROOT_OCC_URL}/*`, restApiOrigin, {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      responseHeadersPolicy: noCacheControlResponseHeaderPolicy,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      compress: true
    });    

 
    //// create the Route53 DNS records for the Cloudfront distribution
    new route53.ARecord(this, 'ARecord', {
      recordName: siteDomainName,
      target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(cloudfrontDistribution)),
      zone
    });
    new route53.AaaaRecord(this, 'AaaaRecord', {
      recordName: siteDomainName,
      target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(cloudfrontDistribution)),
      zone
    });

    //// CloudFormation Outputs

    new CfnOutput(this, id="Route53HostedZoneId", {
      value: zone.hostedZoneId,
      description: "The Route53 Hosted Zone Id"
    })

    new CfnOutput(this, id="S3BucketName", {
      value: assetsBucket.bucketName,
      description: "S3 Bucket Name"
    })

    new CfnOutput(this, id="CloudFrontDistributionDomainName", {
      value: cloudfrontDistribution.distributionDomainName,
      description: "CloudFront distribution Domain Name"
    })
    new CfnOutput(this, id="CloudFrontDistributionID", {
      value: cloudfrontDistribution.distributionId,
      description: "CloudFront distribution ID"
    })
  }
}