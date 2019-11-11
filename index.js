'use strict';
const util = require('util');
const fetch = require ('node-fetch');
const client_id = process.env.client_id; // Your client id
const client_secret = process.env.client_secret; // Your secret
var SpotifyWebApi = require('spotify-web-api-node');
// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');
// Set the region 
AWS.config.update({region: 'us-east-1'});
// Create the DynamoDB service object
var ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
var authCode = process.env.authCode
var spotifyApi = new SpotifyWebApi({
    clientId: client_id,
    clientSecret: client_secret,
    redirectUri: 'http://localhost/callback'
});


exports.handler = (event, context, callback) => {
    // done is called in order to send information back to the client
    let done = (err, res) => {
        if (err) {
            callback(null,
                {
                    statusCode: 400,
                    body: JSON.stringify({
                        type: "error"
                    }),
                    headers: {
                        'Access-Control-Allow-Origin':'*' ,
                    "Access-Control-Allow-Headers":'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
                    }

                });
        }
        else {
            callback(null,
                {
                    statusCode: 200,
                    body: JSON.stringify({
                        type: "success",
                        currentlyPlaying: res
                    }),
                    headers: {
                                                'Access-Control-Allow-Origin':'*' ,
                    "Access-Control-Allow-Headers":'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
                    }
                });
        }
    };

    // retrieve access token from Spotify API
    let getAccessToken = (queryStringParameters, dyn) => {
        // build Spotify API querystring according to the "Your application requests authorization"
        //    section of https://developer.spotify.com/web-api/authorization-guide/#implicit-grant-flow
        let url = 'https://accounts.spotify.com/api/token';
        let encoded = (new Buffer(client_id + ':' + client_secret).toString('base64'));
        // console.log("encoded = " + encoded);

        let params = {
            grant_type: 'refresh_token',
            refresh_token: dyn,
        };

        const formParams = Object.keys(params).map((key) => {
            return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }).join('&');

        return fetch(url, {
            method: 'POST',
            headers: {
                "Authorization": 'Basic ' + encoded,
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formParams
        })
            .then((response) => {
                return response.json();
            })
            .then((json) => {
                // console.log("-----------------------------------------------");
                // console.log("response ", json)
                // setToken(json.refresh_token)
                spotifyApi.setAccessToken(json.access_token)
                getCurrentlyPlaying()

            })
            .catch((error) => {
                done({
                    error: error
                });
            });
    };
    
    let getCurrentlyPlaying = () => {
        // Get information about current playing song for signed in user
        var response
        var isPlaying = false
        // get the current playback state and if i'm not currently playing anything, grab the last played track
        spotifyApi.getMyCurrentPlaybackState({})
            .then(function(data) {
                // Output items
                console.log("Now Playing: ",data.body);
                if(data.body.is_playing) {
                    response = {
                    "songName": data.body.item.name,
                    "songUrl": data.body.item.external_urls.spotify,
                    "artistName": data.body.item.artists[0].name
                    }
                    isPlaying = true
                    done(null, response);
                }
            }, function(err) {
                console.log('Something went wrong!', err);
                done(null, {
                    error: err
                });
            });
        if (!isPlaying) {
            spotifyApi.getMyRecentlyPlayedTracks({})
                .then(function(data) {
                    console.log(data.body.items[0].track)
                    response = {
                        "songName": data.body.items[0].track.name,
                        "songUrl": data.body.items[0].track.external_urls.spotify,
                        "artistName": data.body.items[0].track.artists[0].name
                    }
                    done(null, {
                        json: response
                    });
                }, function(err){
                    console.log('Something went wrong!', err);
                    done(null, {
                        error: err
                    });
                });
        }
    }
    // grab token from dynamodb
    let getCurrentToken = () => {
        var params = {
            TableName: 'NowPlaying',
            Key: {
                'spotify': {"S":"prod"}
            }
        };
        // Call DynamoDB to read the item from the table
        ddb.getItem(params, function(err, data) {
        if (err) {
            // console.log("Error", err);
        } else {
            // console.log("Success", data.Item.accessToken.S);
            // console.log(data.Item.accessToken)
            getAccessToken(event.queryStringParameters, data.Item.accessToken.S);
        }
    });
    }
    // set token in the dynamodb table
    let setToken = (token) => {
        var params = {
            TableName: 'NowPlaying',
            Item: {
                'spotify' : {"S": 'prod'},
                'accessToken' : {"S": token},
                'expiresAt': {"S": 'asdfadsfsdafsdfsdf'}
            }
        };
        ddb.putItem(params, function(err, data) {
        if (err) {
            console.log("Error", err);
        } else {
            console.log("Success", data);
        }
        });
    }

    // enter here
    try {
        getCurrentToken()
    } catch (error) {
        console.log("initialization error");
        console.log(util.inspect(error, { showHidden: true, depth: null }));
        done(error);
    }
};