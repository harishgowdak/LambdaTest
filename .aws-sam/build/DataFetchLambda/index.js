const fetch = require('node-fetch'),
    AWS = require('aws-sdk'),
    { promisify } = require('util'),
    secretName = process.env.ENDPOINT_SECRET;
const dynamoDB = new AWS.DynamoDB.DocumentClient({ region: "us-east-2" });
var _ = require('lodash');
var client = new AWS.SecretsManager()
client.fetchSecret = promisify(client.getSecretValue)

exports.schedulerHandler = async (event, context) => {

    try {
        const secret = (await client.fetchSecret({ SecretId: secretName })).SecretString;
        const apiUrl = `${process.env.APIURL}/search?show-fields=body%2Cthumbnail&q=cricket&api-key=${secret}`;
        
        const response = await fetch(apiUrl);
        const json = await response.json();
        if (json.response && json.response.results && json.response.results.length > 0) {
            let results = json.response.results;
            results = results.map(result => _.pick(result, ['id', 'webPublicationDate', 'webTitle', 'sectionId', 'apiUrl', 'fields.body', 'fields.thumbnail']));

            let items = [];
            for (let index = 0; index < results.length; index++) {
                items.push({PutRequest : { Item:results[index] }});
            }

            var params = {
                RequestItems: {
                    'cricket': items
                }
            };

            await dynamoDB.batchWrite(params).promise();
            return { statusCode: 200, body: 'Success' };

        } else {
            return { statusCode: 200, body: 'No Records' };
        }

    } catch (error) {
        return {
            statusCode: 400,
            error: `Could not post: ${error.stack}`
        };
    }
}

const getAllData = async (params, allData) => { 

    let data = await dynamoDB.scan(params).promise();

    if(data['Items'].length > 0) {
        allData = [...allData, ...data['Items']];
    }

    if (data.LastEvaluatedKey) {
        params.ExclusiveStartKey = data.LastEvaluatedKey;
        return await getAllData(params, allData);

    } else {
        return { statusCode: 200, body: JSON.stringify(data) };
    }
}



exports.scanHandler = async (event, context) => {

    try {
        let bodyData = event.body ? JSON.parse(event.body) : null;
        if (bodyData && bodyData.date) {
            var params = {
                TableName: process.env.TABLE_NAME,
                FilterExpression: 'webPublicationDate >= :reqDate',
                ExpressionAttributeValues: {
                    ':reqDate': '2021-07-11T18:56:43Z'
                }
            }
            return await getAllData(params, []);
        } else {
            return { statusCode: 200, message: 'No records found' };
        }
    } catch (error) {
        return {
            statusCode: 400,
            error: `Could not fetch: ${error.stack}`
        };
    }
}



// const chunkArrayInGroups = async (arr, size) => {
//     var myArray = [];
//     for(var i = 0; i < arr.length; i += size) {
//       myArray.push(arr.slice(i, i+size));
//     }
//     return myArray;
// }