const { user } = require('../api/entities/index')
const shortid = require('shortid')

/**
 * Make any changes you need to make to the database here
 */
async function up () {
  try {
    shortid.seed(Math.random())
    let users = await user.model.find()

    await Promise.all(users.map(async user => {
      if (!user.id) {
        user.id = shortid.generate()
        await user.save()
      }
      
      return user
    }))
  } catch (e) {
    return false
  }
}

/**
 * Make any changes that UNDO the up function side effects here (if possible)
 */
async function down () {
  // Write migration here
}

module.exports = { up, down };
