// An invented Gmail API message (users.messages.get, format=full): a new statement from a sample source.
export const statementMessage = {
  "id": "msg-power-0612",
  "threadId": "t1",
  "internalDate": "1936447200000",
  "payload": {
    "mimeType": "multipart/alternative",
    "headers": [
      {
        "name": "From",
        "value": "Example Power Co <billing@power.example.com>"
      },
      {
        "name": "Subject",
        "value": "Your Example Power Co bill is ready"
      }
    ],
    "parts": [
      {
        "mimeType": "text/plain",
        "body": {
          "data": "VmlldyB5b3VyIGJpbGwgb25saW5lLg"
        }
      },
      {
        "mimeType": "text/html",
        "body": {
          "data": "PGh0bWw-PGJvZHk-PHRhYmxlPgo8dHI-PHRkPlN0YXRlbWVudCBmb3I8L3RkPjx0ZD5NYXkgMSAmbmRhc2g7IE1heSAzMSwgMjAzMTwvdGQ-PC90cj4KPHRyPjx0ZD48c3Ryb25nPkFtb3VudCBEdWU8L3N0cm9uZz48L3RkPjx0ZD48c3Ryb25nPiYjMzY7MTM1LjAwPC9zdHJvbmc-PC90ZD48L3RyPgo8dHI-PHRkPkR1ZSBEYXRlPC90ZD48dGQ-SnVuZSAxMiwgMjAzMTwvdGQ-PC90cj48L3RhYmxlPgo8cD5Zb3UgYXJlIGVucm9sbGVkIGluIEF1dG9QYXkuIFlvdXIgcGF5bWVudCB3aWxsIGJlIGRyYWZ0ZWQgb24gSnVuZSAxMiwgMjAzMS48L3A-PC9ib2R5PjwvaHRtbD4"
        }
      }
    ]
  }
};
