const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

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
        return messageRef.set(res, {merge: true});
    });
});