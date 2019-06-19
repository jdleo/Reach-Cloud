const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

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
                    //send to topic
                    let sendOff = admin.messaging().sendToTopic("order_" + user.data().sender, payload, options);

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
                body: `@${doc.username} has approved your order request. Pay for the promoted post to lock your order in!`,
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
                body: `You just received a payment for ${doc.price}`,
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