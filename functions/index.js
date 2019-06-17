const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

exports.orderUpdate = functions.firestore.document('orderTree/{orderId}').onUpdate((change, context) => {
    //reference to db
    var db = admin.firestore();

    //object representing the document (after change)
    const doc = change.after.data();

    //status field
    const status = doc.status;

    //parties
    const parties = doc.parties;

    //check if status is 'completed'
    if (status === "completed") {
        //check if no reviews have been left yet
        if (!(doc[`review_${parties[0]}`]) && !(doc[`review_${parties[1]}`])) {
            return db.collection('socials').where('username', '==', doc.username).get().then(function(snap) {
                //check if has orders field
                if (snap[0].orders) {
                    //reference to current document in firestore
                    let socialRef = db.collection("socials").doc(snap[0].id)

                    //return promise
                    return socialRef.set(["orders": 1], { merge: true });
                } else {
                    //reference to current document in firestore
                    let socialRef = db.collection("socials").doc(snap[0].id)

                    //orders
                    let orders = snap[0].orders;

                    //return promise
                    return socialRef.set(["orders": orders + 1], { merge: true });
                }
            });
        }
    }

    //complete
    return;
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