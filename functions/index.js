const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors')({ origin: true });
admin.initializeApp(functions.config().firebase);

const app = express();
const main = express();

main.use('/api/', app);
main.use(cors);
main.use(bodyParser.json());
main.use(bodyParser.urlencoded({ extended: false }));

//hello world
app.get('/v1/:username', (req, res) => {
    //set JSON content type and CORS headers for the response
    res.header('Content-Type', 'application/json');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    //respond to CORS preflight requests
    if (req.method == 'OPTIONS') {
        res.status(204).send('');
    }

    //reference to db
    var db = admin.firestore();

    let socialRef = db.collection('socials').where('username', '==', req.params.username).orderBy('price', 'desc').get().then(function(snap) {
        if (snap) {
            //user returned by query
            let user = snap.docs[0];
            if (user["_fieldsProto"]["verified"]["boolValue"] == false) {
                res.status(404).send('The username that was found wasnt verified')
            } else {
                if (user) {
                    let promoRef = db.collection("socials").doc(user.id).collection("promotionalServices").get().then(function(snap2) {
                        if (snap2) {
                            var resultz = []
                            snap2.docs.forEach(function(e) {
                                resultz.push({
                                    "title": e["_fieldsProto"]["title"]["stringValue"],
                                    "description": e["_fieldsProto"]["description"]["stringValue"],
                                    "price": e["_fieldsProto"]["price"]["integerValue"]
                                })
                            });
                            res.status(200).json(resultz);
                        } else {
                            res.status(404).send('Username not found.');
                        }
                    });
                } else {
                    res.status(404).send('Username not found.');
                }
            }
        } else {
            res.status(404).send('Username not found.');
        }
    });
})

exports.promoApi = functions.https.onRequest(main);

exports.newMessage = functions.firestore.document('chats/{cid}').onWrite((change, context) => {
    const doc = change.after.exists ? change.after.data() : null;
    if (!doc) {
        return;
    }

    var sender = "";

    doc.parties.forEach(function(p) {
        if (p != doc.receiver) {
            sender = p;
        }
    });

    const payload = {
        notification: {
            title: doc[sender],
            body: doc.lastMessage.substring(0, 200),
            sound: "default"
        }
    }
    const options = {
        priority: "high"
    }
    //send to topic
    return admin.messaging().sendToTopic("chat_" + doc.receiver, payload, options);

});

exports.orderUpdate = functions.firestore.document('orderTree/{orderId}').onWrite((change, context) => {
    const doc = change.after.exists ? change.after.data() : null;
    if (!doc) {
        return;
    }

    //reference to db
    var db = admin.firestore();

    //status field
    const status = doc.status;

    //parties
    const parties = doc.parties;

    //check if status is 'completed'
    if (status === "completed") {
        //check if no reviews have been left yet
        if (!(doc[`review_${parties[0]}`]) && !(doc[`review_${parties[1]}`])) {
            return db.collection('socials').where('username', '==', doc.username).get().then(function(snap) {
                //user returned by query
                let user = snap.docs[0];
                //check if has orders field
                if ("orders" in user.data()) {
                    //reference to current document in firestore
                    let socialRef = db.collection("socials").doc(user.id);

                    //orders
                    let orders = parseInt(user.data().orders);

                    const payload = {
                        notification: {
                            title: "Order Update",
                            body: `@${user.data().username} has marked your order as complete.`,
                            sound: "default"
                        }
                    }

                    const options = {
                        priority: "high"
                    }
                    //return promise
                    return socialRef.set({ "orders": orders + 1 }, { merge: true });
                } else {
                    //reference to current document in firestore
                    let socialRef = db.collection("socials").doc(user.id)

                    //return promise
                    return socialRef.set({ "orders": 1 }, { merge: true });
                }
            });
        } else {
            return;
        }
    } else if (status === "requested") {
        const payload = {
            notification: {
                title: "New Order",
                body: `A client has requested an order for @${doc.username}`,
                sound: "default"
            }
        }
        const options = {
            priority: "high"
        }
        //send to topic
        return admin.messaging().sendToTopic("order_" + doc.receiver, payload, options);
    } else if (status === "approved") {
        const payload = {
            notification: {
                title: "Order Approved",
                body: `@${doc.username} has approved your order request. Pay for the post to lock your order in!`,
                sound: "default"
            }
        }
        const options = {
            priority: "high"
        }
        //send to topic
        return admin.messaging().sendToTopic("order_" + doc.sender, payload, options);
    } else if (status === "paid") {
        const payload = {
            notification: {
                title: "You've got money!",
                body: `You've just received a payment for $${doc.price}`,
                sound: "default"
            }
        }
        const options = {
            priority: "high"
        }
        //send to topic
        return admin.messaging().sendToTopic("order_" + doc.receiver, payload, options);
    } else if (status === "live") {
        const payload = {
            notification: {
                title: "Post is live!",
                body: `Your promoted post is now live on @${doc.username}`,
                sound: "default"
            }
        }
        const options = {
            priority: "high"
        }
        //send to topic
        return admin.messaging().sendToTopic("order_" + doc.sender, payload, options);
    } else {
        //do nothing
        return;
    }
});

exports.newConvo = functions.firestore.document('chats/{conversationId}').onCreate((snap, context) => {
    //reference to db
    var db = admin.firestore();

    //object representing the new document
    const doc = snap.data();

    //document ID
    let documentID = context.params.conversationId;

    //get both party members UIDs
    const members = doc.parties;

    //empty dictionary
    var res = {};

    //promises array
    var promises = [];

    //iterate through conversation members
    members.forEach(function(member) {
        var currentPromise = db.collection("users").doc(member).get().then(snapshot => {
            //this user
            const userDoc = snapshot.data();
            //check account type
            if (userDoc.accountType == 2) {
                //influencer
                const name = userDoc.firstName + " " + userDoc.lastName;
                res[member] = name;
            } else if (userDoc.accountType == 1) {
                //brand
                const name = userDoc.name;
                res[member] = name;
            }
        });
        //push to promises array
        promises.push(currentPromise);
    });

    //all done
    return Promise.all(promises).then(function(values) {
        //reference to current document in firestore
        let messageRef = db.collection("chats").doc(documentID)

        //return promise
        return messageRef.set(res, { merge: true });
    });
});